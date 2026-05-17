'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import { buildTrackLabel } from '@/lib/trackLabel';
import LEDDisplay from './LEDDisplay';

export default function NowPlayingStrip() {
  const { activeTrack, isPlaying } = useMixFlipStore(useShallow((s) => ({
    activeTrack: s.tracks.find((t) => t.id === s.activeTrackId) ?? null,
    isPlaying: s.isPlaying,
  })));

  const label = activeTrack ? buildTrackLabel(activeTrack) : 'Load your tracks';

  return (
    <div className="pipboy-screen relative h-9 overflow-hidden">
      <LEDDisplay
        label={label}
        color={activeTrack?.color ?? '#e8382c'}
        isPlaying={isPlaying}
        activeTrackId={activeTrack?.id ?? null}
        forceScroll={!activeTrack}
      />
    </div>
  );
}
