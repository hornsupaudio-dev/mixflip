'use client';

// Singleton Web Audio engine.
// All timing is on the AudioContext hardware clock — never setTimeout for scheduling.

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

type TimeListener = (t: number) => void;
export type SpeakerSim = 'off' | 'car' | 'room' | 'arena';

class AudioEngine {
  private _ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private currentSource: AudioBufferSourceNode | null = null;
  private currentGainNode: GainNode | null = null;
  private gen = 0;

  private startedAt = 0;
  private _pausedAt = 0;

  private activeBuffer: AudioBuffer | null = null;
  private activeGainDb = 0;

  private rafId: number | null = null;
  private timeListeners = new Set<TimeListener>();
  private _cachedTime = 0;

  // ── Processing graph (built once, persists) ─────────────────────────────────
  private insertBus: GainNode | null = null;
  private monoBypassGain: GainNode | null = null;
  private monoWetGain: GainNode | null = null;
  private postMono: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private carWetGain: GainNode | null = null;
  private roomWetGain: GainNode | null = null;
  private arenaWetGain: GainNode | null = null;
  private insertOut: GainNode | null = null;
  // Convolver nodes exposed for IR swapping
  private carConvolver: ConvolverNode | null = null;
  private roomConvolver: ConvolverNode | null = null;
  private arenaConvolver: ConvolverNode | null = null;
  // Sim state tracked internally so applySimGains can recalculate
  private _currentSim: SpeakerSim = 'off';
  private _simWetDry = 1;

  // ── AudioContext ────────────────────────────────────────────────────────────

  private get ctx(): AudioContext {
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this.masterGain = this._ctx.createGain();
      this.masterGain.connect(this._ctx.destination);
      this.ensureGraph();
    }
    return this._ctx;
  }

  // ── Processing graph construction ───────────────────────────────────────────

  private makeIR(durationSec: number, rt60: number, earlyTaps: number): AudioBuffer {
    const ctx = this._ctx!;
    const length = Math.floor(durationSec * ctx.sampleRate);
    // 1-channel IR: Web Audio convolves each stereo input channel independently,
    // preserving the stereo image without cross-channel mixing artifacts.
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const tau = rt60 / 6.91;
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * tau));
    }
    for (let t = 0; t < earlyTaps; t++) {
      const pos = Math.floor((0.005 + Math.random() * 0.04) * ctx.sampleRate);
      if (pos < length) data[pos] += (Math.random() * 2 - 1) * 0.5;
    }

    // L2-norm normalization: Σ(IR[n]²) = 1 → convolution approximately preserves input RMS.
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
    const l2 = Math.sqrt(sumSq);
    if (l2 > 0) {
      const scale = 1 / l2;
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }

    return buffer;
  }

  private ensureGraph() {
    const ctx = this._ctx!;

    // ── insertBus: entry point for all per-play gainNodes ───────────────────
    this.insertBus = ctx.createGain();

    // ── Mono fold (stereo bypass ↔ L+R sum) ─────────────────────────────────
    this.monoBypassGain = ctx.createGain();
    this.monoBypassGain.gain.value = 1;

    // Downmix to mono then re-expand to stereo
    const monoDownmix = ctx.createGain();
    monoDownmix.channelCount = 1;
    monoDownmix.channelCountMode = 'explicit';
    monoDownmix.channelInterpretation = 'speakers'; // sums L+R at -6dB automatically

    const monoExpander = ctx.createChannelMerger(2);
    monoDownmix.connect(monoExpander, 0, 0);
    monoDownmix.connect(monoExpander, 0, 1);

    this.monoWetGain = ctx.createGain();
    this.monoWetGain.gain.value = 0;
    monoExpander.connect(this.monoWetGain);

    this.postMono = ctx.createGain();

    this.insertBus.connect(this.monoBypassGain);
    this.insertBus.connect(monoDownmix);
    this.monoBypassGain.connect(this.postMono);
    this.monoWetGain.connect(this.postMono);

    // ── Speaker sim branches ─────────────────────────────────────────────────
    this.insertOut = ctx.createGain();

    // Dry path (sim = off)
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.postMono.connect(this.dryGain);
    this.dryGain.connect(this.insertOut);

    // ── Car: gentle hi-cut + slight presence + room ──────────────────────────
    const carLP = ctx.createBiquadFilter();
    carLP.type = 'lowpass'; carLP.frequency.value = 5000; carLP.Q.value = 0.5;

    const carPeak = ctx.createBiquadFilter();
    carPeak.type = 'peaking'; carPeak.frequency.value = 1800; carPeak.gain.value = 1.5; carPeak.Q.value = 0.8;

    this.carConvolver = ctx.createConvolver();
    this.carConvolver.normalize = false;
    this.carConvolver.buffer = this.makeIR(0.35, 0.18, 5);

    this.carWetGain = ctx.createGain();
    this.carWetGain.gain.value = 0;

    this.postMono.connect(carLP);
    carLP.connect(carPeak); carPeak.connect(this.carConvolver);
    this.carConvolver.connect(this.carWetGain); this.carWetGain.connect(this.insertOut);

    // ── Living room: slight coloration + medium reverb ───────────────────────
    const roomShelf = ctx.createBiquadFilter();
    roomShelf.type = 'highshelf'; roomShelf.frequency.value = 12000; roomShelf.gain.value = -1.5;

    const roomPeak = ctx.createBiquadFilter();
    roomPeak.type = 'peaking'; roomPeak.frequency.value = 280; roomPeak.gain.value = 1.5; roomPeak.Q.value = 1.5;

    this.roomConvolver = ctx.createConvolver();
    this.roomConvolver.normalize = false;
    this.roomConvolver.buffer = this.makeIR(0.8, 0.45, 5);

    this.roomWetGain = ctx.createGain();
    this.roomWetGain.gain.value = 0;

    this.postMono.connect(roomShelf);
    roomShelf.connect(roomPeak); roomPeak.connect(this.roomConvolver);
    this.roomConvolver.connect(this.roomWetGain); this.roomWetGain.connect(this.insertOut);

    // ── Arena: wide shelving + long reverb with early reflections ────────────
    const arenaHiShelf = ctx.createBiquadFilter();
    arenaHiShelf.type = 'highshelf'; arenaHiShelf.frequency.value = 8000; arenaHiShelf.gain.value = -2;

    const arenaLoShelf = ctx.createBiquadFilter();
    arenaLoShelf.type = 'lowshelf'; arenaLoShelf.frequency.value = 120; arenaLoShelf.gain.value = -1;

    this.arenaConvolver = ctx.createConvolver();
    this.arenaConvolver.normalize = false;
    this.arenaConvolver.buffer = this.makeIR(4.5, 3.0, 12);

    this.arenaWetGain = ctx.createGain();
    this.arenaWetGain.gain.value = 0;

    this.postMono.connect(arenaHiShelf);
    arenaHiShelf.connect(arenaLoShelf); arenaLoShelf.connect(this.arenaConvolver);
    this.arenaConvolver.connect(this.arenaWetGain); this.arenaWetGain.connect(this.insertOut);

    // Final output
    this.insertOut.connect(this.masterGain!);
  }

  // ── Processing controls (gain ramps only — no graph mutations) ──────────────

  setMonoFold(enabled: boolean) {
    // ctx getter builds the graph if not yet created
    const ctx = this.ctx;
    if (!this.monoBypassGain || !this.monoWetGain) return;
    const now = ctx.currentTime;
    const TC = 0.007;
    this.monoBypassGain.gain.cancelScheduledValues(now);
    this.monoWetGain.gain.cancelScheduledValues(now);
    this.monoBypassGain.gain.setTargetAtTime(enabled ? 0 : 1, now, TC);
    this.monoWetGain.gain.setTargetAtTime(enabled ? 1 : 0, now, TC);
  }

  setSpeakerSim(sim: SpeakerSim) {
    void this.ctx; // ensure graph built
    this._currentSim = sim;
    this.applySimGains();
  }

  setSimWetDry(wet: number) {
    this._simWetDry = Math.max(0, Math.min(1, wet));
    if (this._ctx) this.applySimGains();
  }

  setSimIR(sim: Exclude<SpeakerSim, 'off'>, buffer: AudioBuffer) {
    const convolver = sim === 'car' ? this.carConvolver
      : sim === 'room' ? this.roomConvolver
      : this.arenaConvolver;
    if (convolver) convolver.buffer = buffer;
  }

  private applySimGains() {
    if (!this.dryGain || !this.carWetGain || !this.roomWetGain || !this.arenaWetGain || !this._ctx) return;
    const now = this._ctx.currentTime;
    const TC = 0.015;
    const sim = this._currentSim;
    const wet = this._simWetDry;
    const dry = sim === 'off' ? 1 : 1 - wet;
    this.dryGain.gain.cancelScheduledValues(now);
    this.carWetGain.gain.cancelScheduledValues(now);
    this.roomWetGain.gain.cancelScheduledValues(now);
    this.arenaWetGain.gain.cancelScheduledValues(now);
    this.dryGain.gain.setTargetAtTime(dry, now, TC);
    this.carWetGain.gain.setTargetAtTime(sim === 'car' ? wet : 0, now, TC);
    this.roomWetGain.gain.setTargetAtTime(sim === 'room' ? wet : 0, now, TC);
    this.arenaWetGain.gain.setTargetAtTime(sim === 'arena' ? wet : 0, now, TC);
  }

  setMasterVolume(linear: number) {
    const ctx = this.ctx; // ensures graph is built
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, linear)), now, 0.01);
  }

  // Ramp gain on the currently playing source without restarting it.
  setActiveGain(gainDb: number) {
    this.activeGainDb = gainDb;
    if (!this.currentGainNode || !this._ctx) return;
    const now = this._ctx.currentTime;
    this.currentGainNode.gain.cancelScheduledValues(now);
    this.currentGainNode.gain.setTargetAtTime(dbToLinear(gainDb), now, 0.01);
  }

  // ── Public time subscription (useSyncExternalStore compatible) ─────────────

  subscribeToTime = (fn: TimeListener): (() => void) => {
    this.timeListeners.add(fn);
    return () => this.timeListeners.delete(fn);
  };

  getPosition = (): number => {
    if (!this._ctx || !this.currentSource) return this._pausedAt;
    return Math.max(0, this._ctx.currentTime - this.startedAt);
  };

  getSnapshot = (): number => this._cachedTime;

  get isPlaying(): boolean {
    return !!this.currentSource;
  }

  // ── File decoding ───────────────────────────────────────────────────────────

  async decodeFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private notify(pos: number) {
    this._cachedTime = pos;
    this.timeListeners.forEach(fn => fn(pos));
  }

  private startRAF() {
    if (this.rafId !== null) return;
    const tick = () => {
      this.notify(this.getPosition());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRAF() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private fadeOutAndStop(
    source: AudioBufferSourceNode,
    gainNode: GainNode,
    when: number,
    fadeDuration: number,
  ) {
    source.onended = null;
    gainNode.gain.setValueAtTime(gainNode.gain.value, when);
    gainNode.gain.linearRampToValueAtTime(0, when + fadeDuration);
    source.stop(when + fadeDuration + 0.01);
    setTimeout(() => gainNode.disconnect(), (fadeDuration + 0.1) * 1000);
  }

  // ── Playback control ────────────────────────────────────────────────────────

  play(buffer: AudioBuffer, gainDb: number, offset = 0) {
    const ctx = this.ctx; // ensures graph is built
    if (ctx.state === 'suspended') ctx.resume();

    const FADE = 0.01;
    const when = ctx.currentTime + 0.005;
    const clampedOffset = Math.max(0, Math.min(offset, buffer.duration - 0.001));
    const myGen = ++this.gen;

    if (this.currentSource && this.currentGainNode) {
      this.fadeOutAndStop(this.currentSource, this.currentGainNode, when, FADE);
      this.currentSource = null;
      this.currentGainNode = null;
    }

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(dbToLinear(gainDb), when + FADE);
    gainNode.connect(this.insertBus!); // → processing graph → masterGain

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(when, clampedOffset);

    this.startedAt = when - clampedOffset;
    this.currentSource = source;
    this.currentGainNode = gainNode;
    this.activeBuffer = buffer;
    this.activeGainDb = gainDb;

    source.onended = () => {
      if (myGen === this.gen) {
        this.currentSource = null;
        this.currentGainNode = null;
        this._pausedAt = 0;
        this.stopRAF();
        this.onEnded?.();
      }
    };

    this.startRAF();
  }

  switchTo(buffer: AudioBuffer, gainDb: number) {
    const ctx = this.ctx;
    const pos = this.getPosition();
    const FADE = 0.04;
    const when = ctx.currentTime + 0.005;
    const myGen = ++this.gen;

    if (this.currentSource && this.currentGainNode) {
      this.fadeOutAndStop(this.currentSource, this.currentGainNode, when, FADE);
      this.currentSource = null;
      this.currentGainNode = null;
    }

    const clampedPos = Math.max(0, Math.min(pos, buffer.duration - 0.001));

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(dbToLinear(gainDb), when + FADE);
    gainNode.connect(this.insertBus!);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(when, clampedPos);

    this.startedAt = when - clampedPos;
    this.currentSource = source;
    this.currentGainNode = gainNode;
    this.activeBuffer = buffer;
    this.activeGainDb = gainDb;

    source.onended = () => {
      if (myGen === this.gen) {
        this.currentSource = null;
        this.currentGainNode = null;
        this._pausedAt = 0;
        this.stopRAF();
        this.onEnded?.();
      }
    };

    this.startRAF();
  }

  pause() {
    this._pausedAt = this.getPosition();
    if (this.currentSource && this.currentGainNode) {
      const ctx = this._ctx!;
      const FADE = 0.01;
      const when = ctx.currentTime;
      this.fadeOutAndStop(this.currentSource, this.currentGainNode, when, FADE);
      this.currentSource = null;
      this.currentGainNode = null;
    }
    this.stopRAF();
    this.notify(this._pausedAt);
  }

  seek(time: number) {
    const wasPlaying = !!this.currentSource;
    this._pausedAt = time;
    if (this.currentSource && this.currentGainNode) {
      const FADE = 0.01;
      const when = this._ctx!.currentTime;
      this.fadeOutAndStop(this.currentSource, this.currentGainNode, when, FADE);
      this.currentSource = null;
      this.currentGainNode = null;
    }
    this.stopRAF();
    if (wasPlaying && this.activeBuffer) {
      this.play(this.activeBuffer, this.activeGainDb, time);
    } else {
      this.notify(time);
    }
  }

  previewSeek(time: number) {
    this._pausedAt = time;
    this.notify(time);
  }

  onEnded?: () => void;
}

export const audioEngine = new AudioEngine();
