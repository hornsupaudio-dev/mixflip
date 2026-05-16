// Module-level storage for non-serializable audio data.
// Kept outside Zustand to avoid reactive store overhead on large objects.

const bufferMap = new Map<string, AudioBuffer>();
const waveformMap = new Map<string, Float32Array>();
const spectrumAvgMap = new Map<string, { avg: Float32Array; n: number }>();

export function getBuffer(id: string): AudioBuffer | undefined {
  return bufferMap.get(id);
}
export function setBuffer(id: string, buf: AudioBuffer): void {
  bufferMap.set(id, buf);
}
export function deleteBuffer(id: string): void {
  bufferMap.delete(id);
  waveformMap.delete(id);
  spectrumAvgMap.delete(id);
}

export function getWaveform(id: string): Float32Array | undefined {
  return waveformMap.get(id);
}
export function setWaveform(id: string, data: Float32Array): void {
  waveformMap.set(id, data);
}

// ── Per-track running spectrum average ──────────────────────────────────────
// Accumulates a running mean of the FFT magnitude (dB) over playback time.
// Built up incrementally per frame the SpectrumDisplay is mounted AND audio
// is playing, so by the end of a song you have a "true average" spectrum for
// that mix — useful for comparing the overall tonal balance of revisions.

export function getSpectrumAvg(id: string): { avg: Float32Array; n: number } | undefined {
  return spectrumAvgMap.get(id);
}

export function updateSpectrumAvg(id: string, bins: Float32Array): void {
  let agg = spectrumAvgMap.get(id);
  if (!agg || agg.avg.length !== bins.length) {
    // First sample (or FFT size changed) — initialise with this frame
    agg = { avg: new Float32Array(bins.length), n: 0 };
    for (let i = 0; i < bins.length; i++) {
      agg.avg[i] = Math.max(-100, bins[i]); // clamp -∞ → -100
    }
    agg.n = 1;
    spectrumAvgMap.set(id, agg);
    return;
  }
  const next = agg.n + 1;
  const prevN = agg.n;
  for (let i = 0; i < bins.length; i++) {
    const v = Math.max(-100, bins[i]); // guard -Infinity
    agg.avg[i] = (agg.avg[i] * prevN + v) / next;
  }
  agg.n = next;
}

export function resetSpectrumAvg(id: string): void {
  spectrumAvgMap.delete(id);
}
