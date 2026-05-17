// Shared formatter for the LED marquee.
// Includes file format / bitrate or sample rate / channel count / size so the
// scrolling text doubles as the "file info" readout. Returns an empty string
// when no track is provided (caller decides on empty-state placeholder).

import type { Track } from '@/store/mixflipStore';

const COMPRESSED = new Set(['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'mp4']);

export function buildTrackLabel(track: Track | null | undefined): string {
  if (!track) return '';
  // Decoding still in flight — just show the name; the rest fills in once ready
  if (track.isLoading || track.sampleRate === 0) return track.label;

  const ext = track.fileName.split('.').pop()?.toLowerCase() ?? '';
  const isCompressed = COMPRESSED.has(ext);

  const fmt = isCompressed
    ? `${Math.round((track.fileSize * 8) / (track.duration * 1000))}K`
    : `${track.sampleRate % 1000 === 0
        ? track.sampleRate / 1000
        : (track.sampleRate / 1000).toFixed(1)}kHz`;

  const ch = track.numberOfChannels === 1 ? 'MONO'
    : track.numberOfChannels === 2 ? 'STEREO'
    : `${track.numberOfChannels}CH`;

  const mb = track.fileSize < 1024 * 1024
    ? `${(track.fileSize / 1024).toFixed(0)}KB`
    : `${(track.fileSize / 1024 / 1024).toFixed(1)}MB`;

  return `${track.label}    ${ext.toUpperCase()}  ${fmt}  ${ch}  ${mb}`;
}
