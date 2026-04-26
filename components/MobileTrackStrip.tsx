'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import VersionTabs from './VersionTabs';
import DropZone from './DropZone';

export default function MobileTrackStrip() {
  const { activeGroup, hasMixes, hasRefs, switchGroup } = useMixFlipStore(useShallow((s) => ({
    activeGroup: s.activeGroup,
    hasMixes: s.tracks.some((t) => t.type === 'mix'),
    hasRefs: s.tracks.some((t) => t.type === 'reference'),
    switchGroup: s.switchGroup,
  })));

  const hasBoth = hasMixes && hasRefs;

  return (
    <div className="flex items-center gap-2 min-h-[44px]">
      {/* REF / MIX mode toggle */}
      <div className="seg-control shrink-0">
        <button
          onClick={hasBoth ? switchGroup : undefined}
          className={['seg-btn', activeGroup === 'reference' ? 'seg-btn-on' : ''].join(' ')}
        >
          REF
        </button>
        <button
          onClick={hasBoth ? switchGroup : undefined}
          className={['seg-btn', activeGroup === 'mix' ? 'seg-btn-on' : ''].join(' ')}
        >
          MIX
        </button>
      </div>

      {/* Horizontally scrollable track tabs for the active group */}
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex items-end gap-2 w-max">
          <VersionTabs group={activeGroup} scroll />
          <DropZone
            trackType={activeGroup}
            maxTracks={activeGroup === 'mix' ? 8 : 5}
            compact
          />
        </div>
      </div>
    </div>
  );
}
