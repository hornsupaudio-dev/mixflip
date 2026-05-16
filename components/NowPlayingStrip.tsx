'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import LEDDisplay from './LEDDisplay';

const COMPRESSED = new Set(['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'mp4']);

function buildLabel(track: {
  label: string; fileName: string; sampleRate: number;
  numberOfChannels: number; fileSize: number; duration: number;
}): string {
  const ext = track.fileName.split('.').pop()?.toLowerCase() ?? '';
  const isCompressed = COMPRESSED.has(ext);
  const fmt = isCompressed
    ? `${Math.round((track.fileSize * 8) / (track.duration * 1000))}K`
    : `${track.sampleRate % 1000 === 0 ? track.sampleRate / 1000 : (track.sampleRate / 1000).toFixed(1)}kHz`;
  const ch = track.numberOfChannels === 1 ? 'MONO' : track.numberOfChannels === 2 ? 'STEREO' : `${track.numberOfChannels}CH`;
  const mb = track.fileSize < 1024 * 1024
    ? `${(track.fileSize / 1024).toFixed(0)}KB`
    : `${(track.fileSize / 1024 / 1024).toFixed(1)}MB`;
  return `${track.label}    ${ext.toUpperCase()}  ${fmt}  ${ch}  ${mb}`;
}

export default function NowPlayingStrip() {
  const { activeTrack, isPlaying } = useMixFlipStore(useShallow((s) => ({
    activeTrack: s.tracks.find((t) => t.id === s.activeTrackId) ?? null,
    isPlaying: s.isPlaying,
  })));

  const ready = activeTrack && !activeTrack.isLoading && activeTrack.sampleRate > 0;
  // Show a friendly prompt when nothing is loaded, instead of leaving the
  // display blank / greyed.
  const label = ready
    ? buildLabel(activeTrack)
    : activeTrack?.label ?? 'Load your tracks';

  return (
    <div className="pipboy-screen relative h-9 overflow-hidden">
      <LEDDisplay
        label={label}
        color={activeTrack?.color ?? 'rgba(255,255,255,0.15)'}
        isPlaying={isPlaying}
        activeTrackId={activeTrack?.id ?? null}
      />
    </div>
  );
}
