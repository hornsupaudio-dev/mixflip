'use client';

// Singleton Web Audio engine.
// All timing is on the AudioContext hardware clock — never setTimeout for scheduling.

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

type TimeListener = (t: number) => void;
export type SpeakerSim = 'off' | 'car' | 'room' | 'arena';

export interface EQBandParams {
  freq: number;
  gain: number; // dB, -12 to +12
  q: number;    // 0.3 to 8 (relevant for peaking bands)
}

// ── Stereo metering ──────────────────────────────────────────────────────────
export interface MeterSnapshot {
  rmsL: number; rmsR: number;   // dBFS — smoothed, "averaged loudness"
  peakL: number; peakR: number; // dBFS — instant attack, slow release
  holdL: number; holdR: number; // dBFS — peak hold
  clip: boolean;                // true while a recent sample hit 0 dBFS
}
type MeterListener = (m: MeterSnapshot) => void;

const SILENT_METER: MeterSnapshot = {
  rmsL: -100, rmsR: -100, peakL: -100, peakR: -100, holdL: -100, holdR: -100, clip: false,
};

function lin2db(v: number): number {
  return v <= 1e-6 ? -100 : 20 * Math.log10(v);
}

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

  // ── Metering ────────────────────────────────────────────────────────────────
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private _meterBufL: Float32Array<ArrayBuffer> | null = null;
  private _meterBufR: Float32Array<ArrayBuffer> | null = null;

  // ── Spectrum analyser (mono sum, larger FFT) ────────────────────────────────
  private analyserSpectrum: AnalyserNode | null = null;
  private _spectrumBuf: Float32Array<ArrayBuffer> | null = null;
  private meterListeners = new Set<MeterListener>();
  private _meterSnapshot: MeterSnapshot = SILENT_METER;
  // Ballistics state (linear amplitude, 0..1+)
  private _mPeakL = 0; private _mPeakR = 0;
  private _mRmsL = 0;  private _mRmsR = 0;
  private _mHoldL = 0; private _mHoldR = 0;
  private _mHoldTL = 0; private _mHoldTR = 0;
  private _mClipUntil = 0;

  // ── Processing graph (built once, persists) ─────────────────────────────────
  private insertBus: GainNode | null = null;
  // ── 4-band parametric EQ (sits between insertBus and mono stage) ────────────
  private _eqBands: BiquadFilterNode[] = [];
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

    // ── 4-band parametric EQ: lowshelf → peaking × 2 → highshelf ────────────
    const eqTypes: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'highshelf'];
    const eqFreqs  = [100, 350, 3500, 10000];
    const eqQs     = [0.7071, 1.0, 1.0, 0.7071];
    this._eqBands = eqTypes.map((type, i) => {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.frequency.value = eqFreqs[i];
      node.gain.value = 0; // neutral — 0 dB is transparent for all types
      node.Q.value = eqQs[i];
      return node;
    });
    // Series chain: insertBus → eq0 → eq1 → eq2 → eq3 (then continues to mono)
    this.insertBus.connect(this._eqBands[0]);
    for (let i = 0; i < 3; i++) this._eqBands[i].connect(this._eqBands[i + 1]);
    // eq3 output → mono stage (replaces old insertBus direct connects below)

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

    // EQ chain output → mono fold
    this._eqBands[3].connect(this.monoBypassGain);
    this._eqBands[3].connect(monoDownmix);
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

    // ── Metering tap — post-processing, PRE-master-trim ─────────────────────
    // Taps insertOut so the meter reflects the actual mix level (post EQ / mono
    // / sim) independent of the monitoring Trim fader.
    const meterSplitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = 2048;
    this.analyserR.fftSize = 2048;
    this._meterBufL = new Float32Array(this.analyserL.fftSize);
    this._meterBufR = new Float32Array(this.analyserR.fftSize);
    this.insertOut.connect(meterSplitter);
    meterSplitter.connect(this.analyserL, 0);
    meterSplitter.connect(this.analyserR, 1);

    // ── Spectrum analyser — mono sum at insertOut, 8192-pt FFT ──────────────
    // Same tap point so the spectrum reflects what the meter measures.
    // 8192 doubles low-end bin density vs. 4096 (~2.7 Hz/bin at 44.1k) — paired
    // with linear interpolation in the display, the bass region reads smooth
    // rather than stair-stepped.
    this.analyserSpectrum = ctx.createAnalyser();
    this.analyserSpectrum.fftSize = 8192;
    this.analyserSpectrum.smoothingTimeConstant = 0.85;
    this.analyserSpectrum.minDecibels = -90;
    this.analyserSpectrum.maxDecibels = 0;
    this.analyserSpectrum.channelCount = 1;
    this.analyserSpectrum.channelCountMode = 'explicit';
    this.analyserSpectrum.channelInterpretation = 'speakers'; // L+R sum at −6 dB
    this._spectrumBuf = new Float32Array(this.analyserSpectrum.frequencyBinCount);
    this.insertOut.connect(this.analyserSpectrum);

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

  // Apply 4-band EQ settings to the persistent filter nodes.
  // enabled=false zeros all gains (transparent pass-through) without disconnecting.
  setEQ(bands: EQBandParams[], enabled: boolean) {
    if (this._eqBands.length === 0) return; // graph not yet built
    const now = this._ctx?.currentTime ?? 0;
    const TC = 0.015; // 15 ms ramp — instant but click-free
    this._eqBands.forEach((node, i) => {
      const band = bands[i];
      if (!band) return;
      node.frequency.setTargetAtTime(band.freq, now, TC);
      node.gain.setTargetAtTime(enabled ? band.gain : 0, now, TC);
      // Q only matters for peaking; shelves use their built-in slope
      if (node.type === 'peaking') {
        node.Q.setTargetAtTime(Math.max(0.1, band.q), now, TC);
      }
    });
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

  // ── Meter subscription (useSyncExternalStore compatible) ───────────────────

  subscribeToMeter = (fn: MeterListener): (() => void) => {
    this.meterListeners.add(fn);
    return () => this.meterListeners.delete(fn);
  };

  getMeterSnapshot = (): MeterSnapshot => this._meterSnapshot;

  // ── Spectrum API ────────────────────────────────────────────────────────────

  // Returns the internal frequency-bin buffer (dB values). Caller reads only.
  // null if the audio graph hasn't been built yet.
  getSpectrumBins(): Float32Array<ArrayBuffer> | null {
    if (!this.analyserSpectrum || !this._spectrumBuf) return null;
    this.analyserSpectrum.getFloatFrequencyData(this._spectrumBuf);
    return this._spectrumBuf;
  }

  get sampleRate(): number {
    return this._ctx?.sampleRate ?? 44100;
  }

  // Computes the combined dB frequency response of a 4-band EQ at the given
  // frequencies, summed across bands. Uses temp BiquadFilterNodes so the
  // response reflects the dialed-in band PARAMS, not the live (possibly
  // bypassed) engine nodes — useful for previewing a setting before enabling.
  getEQResponseFromParams(
    bands: EQBandParams[],
    freqs: Float32Array<ArrayBuffer>,
    magOutDb: Float32Array<ArrayBuffer>,
  ) {
    const ctx = this._ctx;
    if (!ctx) return;
    const types: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'highshelf'];
    const tmpMag = new Float32Array(freqs.length);
    const tmpPhase = new Float32Array(freqs.length);
    magOutDb.fill(0);
    for (let i = 0; i < bands.length && i < types.length; i++) {
      const band = bands[i];
      const node = ctx.createBiquadFilter();
      node.type = types[i];
      node.frequency.value = band.freq;
      node.gain.value = band.gain;
      node.Q.value = band.q;
      node.getFrequencyResponse(freqs, tmpMag, tmpPhase);
      for (let j = 0; j < freqs.length; j++) {
        magOutDb[j] += 20 * Math.log10(Math.max(tmpMag[j], 1e-10));
      }
      // node is not connected; GC will reclaim it
    }
  }

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
      this.updateMeter();
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

  // ── Metering ────────────────────────────────────────────────────────────────

  // Sample the analysers, run ballistics, push a fresh snapshot. Called once
  // per RAF tick — so only while audio is actually playing.
  private updateMeter() {
    const aL = this.analyserL, aR = this.analyserR;
    const bL = this._meterBufL, bR = this._meterBufR;
    if (!aL || !aR || !bL || !bR) return;

    aL.getFloatTimeDomainData(bL);
    aR.getFloatTimeDomainData(bR);

    let peakL = 0, sumL = 0;
    for (let i = 0; i < bL.length; i++) {
      const s = bL[i]; const a = s < 0 ? -s : s;
      if (a > peakL) peakL = a;
      sumL += s * s;
    }
    const rmsL = Math.sqrt(sumL / bL.length);

    let peakR = 0, sumR = 0;
    for (let i = 0; i < bR.length; i++) {
      const s = bR[i]; const a = s < 0 ? -s : s;
      if (a > peakR) peakR = a;
      sumR += s * s;
    }
    const rmsR = Math.sqrt(sumR / bR.length);

    // RMS — exponential smoothing for the slower "averaged loudness" feel
    const RMS_COEF = 0.82;
    this._mRmsL = this._mRmsL * RMS_COEF + rmsL * (1 - RMS_COEF);
    this._mRmsR = this._mRmsR * RMS_COEF + rmsR * (1 - RMS_COEF);

    // Peak — instant attack, slow release (the "realtime" reading)
    const PEAK_REL = 0.96;
    this._mPeakL = peakL > this._mPeakL ? peakL : this._mPeakL * PEAK_REL;
    this._mPeakR = peakR > this._mPeakR ? peakR : this._mPeakR * PEAK_REL;

    // Peak hold — jump up, hold ~1 s, then decay
    const now = performance.now();
    const HOLD_MS = 1000;
    const HOLD_DECAY = 0.93;
    if (this._mPeakL >= this._mHoldL) { this._mHoldL = this._mPeakL; this._mHoldTL = now; }
    else if (now - this._mHoldTL > HOLD_MS) { this._mHoldL *= HOLD_DECAY; }
    if (this._mPeakR >= this._mHoldR) { this._mHoldR = this._mPeakR; this._mHoldTR = now; }
    else if (now - this._mHoldTR > HOLD_MS) { this._mHoldR *= HOLD_DECAY; }

    // Clip — any sample at/over 0 dBFS lights the indicator for 1.5 s
    if (peakL >= 1.0 || peakR >= 1.0) this._mClipUntil = now + 1500;

    this._meterSnapshot = {
      rmsL: lin2db(this._mRmsL),
      rmsR: lin2db(this._mRmsR),
      peakL: lin2db(this._mPeakL),
      peakR: lin2db(this._mPeakR),
      holdL: lin2db(this._mHoldL),
      holdR: lin2db(this._mHoldR),
      clip: now < this._mClipUntil,
    };
    this.meterListeners.forEach(fn => fn(this._meterSnapshot));
  }

  // Snap the meter to silence — called when playback stops.
  private resetMeter() {
    this._mPeakL = this._mPeakR = 0;
    this._mRmsL = this._mRmsR = 0;
    this._mHoldL = this._mHoldR = 0;
    this._meterSnapshot = SILENT_METER;
    this.meterListeners.forEach(fn => fn(this._meterSnapshot));
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
        this.resetMeter();
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
        this.resetMeter();
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
    this.resetMeter();
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
