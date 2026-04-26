// RMS-based loudness normalization with a simple K-weighting pre-filter pass.
// Not a full ITU-R BS.1770 implementation — sufficient for comparing revisions
// of the same song and mix vs. reference comparisons.

// Biquad filter: direct form II transposed
function applyBiquad(
  data: Float32Array,
  b0: number, b1: number, b2: number,
  a1: number, a2: number,
): Float32Array {
  const out = new Float32Array(data.length);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    out[i] = y;
  }
  return out;
}

// K-weighting stage 1: high-shelf +4 dB (pre-filter)
// Coefficients derived for 44100 Hz (close enough for 48k, <0.5 dB error)
function applyKWeightingShelf(data: Float32Array): Float32Array {
  // Pre-filter: Db = +4 dB at ~1.5 kHz
  return applyBiquad(data, 1.53512485958697, -2.69169618940638, 1.19839281085285,
    -1.69065929318241, 0.73248077421585);
}

// K-weighting stage 2: high-pass (fc = 38 Hz, 2nd order Butterworth)
function applyKWeightingHP(data: Float32Array): Float32Array {
  return applyBiquad(data, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
}

function channelRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

// Returns gainDb to apply to this buffer so it matches the target loudness.
// Positive = boost quiet files, negative = attenuate loud files.
export function computeGainDb(buffer: AudioBuffer, targetRms = 0.08): number {
  const channels = buffer.numberOfChannels;
  let totalPower = 0;

  for (let c = 0; c < channels; c++) {
    const raw = buffer.getChannelData(c);
    const weighted = applyKWeightingHP(applyKWeightingShelf(raw));
    const rms = channelRMS(weighted);
    totalPower += rms * rms;
  }

  const rms = Math.sqrt(totalPower / channels);
  if (rms < 0.00001) return 0; // silence guard

  const gainLinear = targetRms / rms;
  const gainDb = 20 * Math.log10(gainLinear);
  return Math.max(-24, Math.min(12, gainDb));
}
