'use client';

import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore, type Track, type TrackType } from '@/store/mixflipStore';

interface Props {
  group: TrackType;
  scroll?: boolean; // horizontal-scroll mode for mobile strip
}

export default function VersionTabs({ group, scroll = false }: Props) {
  const { tracks, activeTrackId, setActiveTrack, removeTrack, updateLabel, setTrackType } =
    useMixFlipStore(useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      setActiveTrack: s.setActiveTrack,
      removeTrack: s.removeTrack,
      updateLabel: s.updateLabel,
      setTrackType: s.setTrackType,
    })));

  const groupTracks = tracks.filter((t) => t.type === group);
  if (groupTracks.length === 0) return null;

  return (
    <div className={scroll ? 'flex flex-nowrap gap-2 items-end' : 'flex flex-wrap gap-2 items-end'}>
      {groupTracks.map((track) => (
        <Tab
          key={track.id}
          track={track}
          isActive={track.id === activeTrackId}
          onSelect={() => setActiveTrack(track.id)}
          onRemove={() => removeTrack(track.id)}
          onLabelChange={(l) => updateLabel(track.id, l)}
          onTypeChange={(t) => setTrackType(track.id, t)}
        />
      ))}
    </div>
  );
}

function Tab({
  track, isActive, onSelect, onRemove, onLabelChange, onTypeChange,
}: {
  track: Track;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onLabelChange: (l: string) => void;
  onTypeChange: (t: TrackType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed) onLabelChange(trimmed);
    else setDraft(track.label);
    setEditing(false);
  };

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(track.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  return (
    <ContextMenu onRename={startEdit} onToggleType={() => onTypeChange(track.type === 'mix' ? 'reference' : 'mix')} trackType={track.type}>
      <div
        onClick={onSelect}
        className={['tape-tab group/tab', isActive ? 'tape-tab-on' : 'tape-tab-off'].join(' ')}
        style={isActive ? { boxShadow: `inset 0 1px 0 rgba(255,240,220,0.06), 0 4px 0 #0a0908, 0 0 14px ${track.color}40, 0 6px 14px rgba(0,0,0,0.55)` } : undefined}
      >
        {/* Color strip */}
        <div className="h-[6px] w-full shrink-0" style={{ backgroundColor: track.color, opacity: isActive ? 1 : 0.6 }} />

        {/* Label body */}
        <div className="tape-tab-body">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') { setDraft(track.label); setEditing(false); }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent outline-none w-24 text-[#1a1714] font-mono text-[10px] uppercase tracking-wider"
              maxLength={32}
            />
          ) : (
            <span
              onDoubleClick={startEdit}
              title="Double-click to rename"
              className="tape-tab-label flex-1"
            >
              {track.label}
            </span>
          )}

          {track.isLoading && (
            <span className="w-3 h-3 rounded-full border border-t-transparent border-[#1a1714]/30 animate-spin shrink-0" />
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="opacity-0 group-hover/tab:opacity-100 transition-opacity text-cream/20 hover:text-cream/60 text-[10px] leading-none ml-1"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
    </ContextMenu>
  );
}

function ContextMenu({
  children, onRename, onToggleType, trackType,
}: {
  children: React.ReactNode;
  onRename: (e: React.MouseEvent) => void;
  onToggleType: () => void;
  trackType: TrackType;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>
      {children}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 hw-panel text-sm text-white/70 overflow-hidden min-w-[160px]" style={{ padding: '4px 0' }}>
            <button className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors font-mono text-[11px] uppercase tracking-wider" onClick={(e) => { setOpen(false); onRename(e); }}>
              Rename
            </button>
            <button className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors font-mono text-[11px] uppercase tracking-wider" onClick={() => { setOpen(false); onToggleType(); }}>
              {trackType === 'mix' ? 'Mark as reference' : 'Mark as mix'}
            </button>
          </div>
        </>
      )}
    </span>
  );
}
