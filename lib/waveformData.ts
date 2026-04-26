export function extractWaveform(buffer: AudioBuffer, points = 1000): Float32Array {
  const data = buffer.getChannelData(0);
  const blockSize = Math.floor(data.length / points);
  const waveform = new Float32Array(points);

  for (let i = 0; i < points; i++) {
    const start = i * blockSize;
    let peak = 0;
    for (let j = 0; j < blockSize; j++) {
      const abs = Math.abs(data[start + j] ?? 0);
      if (abs > peak) peak = abs;
    }
    waveform[i] = peak;
  }

  return waveform;
}
