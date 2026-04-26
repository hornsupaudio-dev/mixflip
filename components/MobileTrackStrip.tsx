'use client';

import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore, type TrackType } from '@/store/mixflipStore';
import VersionTabs from './VersionTabs';
import DropZone from './DropZone';

export default function MobileTrackStrip() {
  const { activeGroup, switchGroup } = useMixFlipStore(useShallow((s) => ({
    activeGroup: s.activeGroup,
    switchGroup: s.switchGroup,
  })));

  // Local display group — lets the user switch to REF to load a first ref track
  // even before any refs exist (the store's switchGroup requires a track to exist).
  const [displayGroup, setDisplayGroup] = useState<TrackType>(activeGroup);

  // Keep in sync when store activeGroup changes (e.g. track removed)
  useEffect(() => {
    setDisplayGroup(activeGroup);
  }, [activeGroup]);

  const selectGroup = (g: TrackType) => {
    setDisplayGroup(g);
    // Also switch the store group if possible (has tracks in that group)
    if (g !== activeGroup) switchGroup();
  };

  return (
    <div className="flex items-center gap-2 min-h-[44px]">
      {/* REF / MIX mode toggle — always tappable */}
      <div className="seg-control shrink-0">
        <button
          onClick={() => selectGroup('reference')}
          className={['seg-btn', displayGroup === 'reference' ? 'seg-btn-on' : ''].join(' ')}
        >
          REF
        </button>
        <button
          onClick={() => selectGroup('mix')}
          className={['seg-btn', displayGroup === 'mix' ? 'seg-btn-on' : ''].join(' ')}
        >
          MIX
        </button>
      </div>

      {/* Horizontally scrollable track tabs for the display group */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex items-end gap-2 w-max">
          <VersionTabs group={displayGroup} scroll />
          <DropZone
            trackType={displayGroup}
            maxTracks={displayGroup === 'mix' ? 8 : 5}
            compact
          />
        </div>
      </div>
    </div>
  );
}
