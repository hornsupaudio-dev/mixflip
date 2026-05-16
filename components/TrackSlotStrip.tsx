'use client';

import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore, type Track } from '@/store/mixflipStore';

interface Props {
  totalSlots: number;       // 6 on mobile, 10 on desktop
  defaultMixSlots: number;  // initial split if no stored preference
  storageKey: string;       // localStorage key for the divider position
  className?: string;
}

const ACCEPTED_EXTS = /\.(mp3|wav|flac|aif|aiff|ogg|m4a|opus)$/i;
function isAudioFile(f: File) {
  return f.type.startsWith('audio/') || ACCEPTED_EXTS.test(f.name);
}

function readStored(key: string, def: number, total: number): number {
  try {
    const v = parseInt(localStorage.getItem(key) ?? '');
    if (!Number.isFinite(v)) return def;
    return Math.max(1, Math.min(total - 1, v));
  } catch { return def; }
}

function saveStored(key: string, n: number) {
  try { localStorage.setItem(key, String(n)); } catch {}
}

export default function TrackSlotStrip({
  totalSlots, defaultMixSlots, storageKey, className = '',
}: Props) {
  const { tracks, activeTrackId, addTracks, setActiveTrack } = useMixFlipStore(
    useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      addTracks: s.addTracks,
      setActiveTrack: s.setActiveTrack,
    })),
  );

  const [mixSlots, setMixSlots] = useState(() =>
    readStored(storageKey, defaultMixSlots, totalSlots),
  );
  const refSlots = totalSlots - mixSlots;

  const mixInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const mixTracks = tracks.filter((t) => t.type === 'mix').slice(0, mixSlots);
  const refTracks = tracks.filter((t) => t.type === 'reference').slice(0, refSlots);

  // Index of the first empty slot per section — gets the "+" icon
  const firstEmptyMix = mixTracks.length < mixSlots ? mixTracks.length : -1;
  const firstEmptyRef = refTracks.length < refSlots ? refTracks.length : -1;

  const handleFiles = (files: FileList | null, type: 'mix' | 'reference') => {
    if (!files) return;
    const arr = Array.from(files).filter(isAudioFile);
    if (!arr.length) return;
    addTracks(arr, type);
  };

  const vibrate = () => { try { navigator.vibrate?.(8); } catch {} };

  const adjustMix = (delta: number) => {
    const next = Math.max(1, Math.min(totalSlots - 1, mixSlots + delta));
    if (next === mixSlots) return;
    setMixSlots(next);
    saveStored(storageKey, next);
    vibrate();
  };

  const renderSlot = (
    track: Track | null,
    type: 'mix' | 'reference',
    i: number,
    isFirstEmpty: boolean,
  ) => {
    const isEmpty   = !track;
    const isActive  = !!track && track.id === activeTrackId;
    const isLoading = track?.isLoading ?? false;
    const hasNotes  = (track?.notes.length ?? 0) > 0;
    const color     = track?.color ?? (type === 'reference' ? '#6b7280' : '#ffffff');
    const label     = `${type === 'mix' ? 'M' : 'R'}${i + 1}`;
    const inputRef  = type === 'mix' ? mixInputRef : refInputRef;

    if (isEmpty) {
      return (
        <button
          key={`${type}-${i}`}
          onPointerDown={() => { vibrate(); inputRef.current?.click(); }}
          title={isFirstEmpty ? `Add ${type === 'mix' ? 'mix' : 'reference'} track` : ''}
          aria-label={isFirstEmpty ? `Add ${type} track` : `${label} (empty)`}
          className="btn-3d flex-1 justify-center relative"
          style={{
            padding: '0 4px',
            opacity: isFirstEmpty ? 0.6 : 0.28,
            color: isFirstEmpty ? 'rgba(232,221,208,0.55)' : 'rgba(232,221,208,0.18)',
            touchAction: 'manipulation',
          }}
        >
          {isFirstEmpty ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
              <path d="M5.5 1.5V9.5M1.5 5.5H9.5"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <span className="font-mono text-[10px] tracking-wider">{label}</span>
          )}
        </button>
      );
    }

    return (
      <button
        key={`${type}-${i}`}
        onPointerDown={() => { vibrate(); if (!isLoading) setActiveTrack(track!.id); }}
        title={track!.label}
        aria-label={`${label}: ${track!.label}${isActive ? ' (active)' : ''}`}
        aria-pressed={isActive}
        className={['btn-3d flex-1 justify-center relative', isActive ? 'btn-3d-on' : ''].join(' ')}
        style={{
          padding: '0 4px',
          color: isActive ? color : `${color}88`,
          boxShadow: isActive && color ? [
            'inset 0 2px 5px rgba(0,0,0,0.6)',
            'inset 0 1px 2px rgba(0,0,0,0.3)',
            '0 2px 0 #0a0908',
            '0 3px 6px rgba(0,0,0,0.45)',
            `0 0 14px ${color}35`,
          ].join(', ') : undefined,
          touchAction: 'manipulation',
        }}
      >
        {hasNotes && (
          <span
            className="absolute top-[4px] right-[4px] w-1 h-1 rounded-full pointer-events-none"
            style={{ background: color, opacity: isActive ? 0.9 : 0.5 }}
          />
        )}
        {isLoading ? (
          <span className="font-mono text-[9px] tracking-widest animate-pulse opacity-50">···</span>
        ) : (
          <span className="font-mono text-[10px] tracking-wider">{label}</span>
        )}
      </button>
    );
  };

  return (
    <div className={`flex items-stretch gap-1.5 h-11 ${className}`}>
      {/* Hidden file pickers */}
      <input
        ref={mixInputRef}
        type="file" accept="audio/*" multiple className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'mix'); e.target.value = ''; }}
      />
      <input
        ref={refInputRef}
        type="file" accept="audio/*" multiple className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'reference'); e.target.value = ''; }}
      />

      {/* Mix slots */}
      {Array.from({ length: mixSlots }).map((_, i) =>
        renderSlot(mixTracks[i] ?? null, 'mix', i, i === firstEmptyMix),
      )}

      {/* Divider with ◄ / ► */}
      <div className="flex flex-col items-center justify-between shrink-0 py-1" style={{ width: 18 }}>
        <button
          onPointerDown={() => adjustMix(1)}
          disabled={mixSlots >= totalSlots - 1}
          className="flex items-center justify-center leading-none"
          style={{
            width: 14, height: 14,
            color: 'rgba(232,221,208,0.35)',
            opacity: mixSlots >= totalSlots - 1 ? 0.12 : 1,
            fontSize: 9,
            background: 'none', border: 'none',
            cursor: mixSlots >= totalSlots - 1 ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
          title="More mix slots"
          aria-label="Add a mix slot"
        >◄</button>

        <div
          className="w-px flex-1 my-0.5"
          style={{ background: 'linear-gradient(180deg, transparent, #3a342e 20%, #3a342e 80%, transparent)' }}
        />

        <button
          onPointerDown={() => adjustMix(-1)}
          disabled={mixSlots <= 1}
          className="flex items-center justify-center leading-none"
          style={{
            width: 14, height: 14,
            color: 'rgba(232,221,208,0.35)',
            opacity: mixSlots <= 1 ? 0.12 : 1,
            fontSize: 9,
            background: 'none', border: 'none',
            cursor: mixSlots <= 1 ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
          title="More ref slots"
          aria-label="Add a reference slot"
        >►</button>
      </div>

      {/* Ref slots */}
      {Array.from({ length: refSlots }).map((_, i) =>
        renderSlot(refTracks[i] ?? null, 'reference', i, i === firstEmptyRef),
      )}
    </div>
  );
}
