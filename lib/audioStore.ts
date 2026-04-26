// Module-level storage for non-serializable audio data.
// Kept outside Zustand to avoid reactive store overhead on large objects.

const bufferMap = new Map<string, AudioBuffer>();
const waveformMap = new Map<string, Float32Array>();

export function getBuffer(id: string): AudioBuffer | undefined {
  return bufferMap.get(id);
}
export function setBuffer(id: string, buf: AudioBuffer): void {
  bufferMap.set(id, buf);
}
export function deleteBuffer(id: string): void {
  bufferMap.delete(id);
  waveformMap.delete(id);
}

export function getWaveform(id: string): Float32Array | undefined {
  return waveformMap.get(id);
}
export function setWaveform(id: string, data: Float32Array): void {
  waveformMap.set(id, data);
}
