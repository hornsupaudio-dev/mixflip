'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { tracks, activeTrackId, addTracks, setActiveTrack, removeTrack } = useMixFlipStore(
    useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      addTracks: s.addTracks,
      setActiveTrack: s.setActiveTrack,
      removeTrack: s.removeTrack,
    })),
  );

  // Long-press / right-click → confirm remove. ref keyed by track id so a
  // press that crosses slot boundaries doesn't fire on the wrong track.
  const longPressRef = useRef<{ trackId: string; timer: number } | null>(null);

  const cancelLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  };

  const promptRemove = (track: Track) => {
    if (typeof window !== 'undefined' && window.confirm(`Remove "${track.label}"?`)) {
      removeTrack(track.id);
    }
  };

  // Always initialise with the default so SSR and the first client render
  // produce identical HTML (localStorage is unavailable on the server). The
  // stored preference is restored in an effect right after mount.
  const [mixSlots, setMixSlots] = useState(defaultMixSlots);
  const refSlots = totalSlots - mixSlots;

  useEffect(() => {
    const stored = readStored(storageKey, defaultMixSlots, totalSlots);
    if (stored !== defaultMixSlots) setMixSlots(stored);
    // Only re-run if the strip is reconfigured with different defaults/key
  }, [storageKey, defaultMixSlots, totalSlots]);

  const mixInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Drag-resize state — set on pointerdown, consumed each pointermove
  const dragRef = useRef<{ startX: number; startMix: number; slotPx: number } | null>(null);

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

  // ── Drag-to-resize ──────────────────────────────────────────────────────────
  // Drag the divider horizontally — each ~slot-width of travel shifts the
  // split by one. The arrow buttons stay as the discrete tap fallback.
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = strip.getBoundingClientRect();
    // Approx slot width — strip minus the divider's 22 px column minus inter-item gaps.
    // gap-1.5 = 6 px, totalSlots + 1 gaps (slots + divider between).
    const gapsPx  = (totalSlots) * 6;
    const slotPx  = Math.max(20, (rect.width - 22 - gapsPx) / totalSlots);
    dragRef.current = { startX: e.clientX, startMix: mixSlots, slotPx };
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    const slotDelta = Math.round((e.clientX - s.startX) / s.slotPx);
    const next = Math.max(1, Math.min(totalSlots - 1, s.startMix + slotDelta));
    if (next !== mixSlots) {
      setMixSlots(next);
      saveStored(storageKey, next);
      vibrate();
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
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
            opacity: isFirstEmpty ? 0.65 : 0.28,
            color: isFirstEmpty ? 'rgba(232,221,208,0.6)' : 'rgba(232,221,208,0.18)',
            touchAction: 'manipulation',
          }}
        >
          <span className="font-mono text-[10px] tracking-wider">
            {label}{isFirstEmpty ? '+' : ''}
          </span>
        </button>
      );
    }

    return (
      <button
        key={`${type}-${i}`}
        onPointerDown={() => {
          vibrate();
          if (!isLoading) setActiveTrack(track!.id);
          // Start a long-press timer for the remove action (touch users)
          cancelLongPress();
          longPressRef.current = {
            trackId: track!.id,
            timer: window.setTimeout(() => {
              longPressRef.current = null;
              promptRemove(track!);
            }, 650),
          };
        }}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelLongPress();
          promptRemove(track!);
        }}
        title={`${track!.label}  (long-press / right-click to remove)`}
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
    <div ref={stripRef} className={`flex items-stretch gap-1.5 h-11 ${className}`}>
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

      {/* Divider — drag the line to resize, tap ◄ / ► for one-slot steps */}
      <div className="flex flex-col items-center justify-between shrink-0 py-1" style={{ width: 22 }}>
        <button
          onPointerDown={(e) => { e.stopPropagation(); adjustMix(1); }}
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

        {/* Drag handle — line in the middle is the visual; full 22 px column is the hit area */}
        <div
          className="flex-1 my-0.5 relative w-full"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ cursor: 'ew-resize', touchAction: 'none' }}
          title="Drag to resize mix/ref split"
          aria-label="Drag to resize mix versus reference split"
        >
          <div
            className="absolute top-0 bottom-0 left-1/2 w-px pointer-events-none"
            style={{
              transform: 'translateX(-0.5px)',
              background: 'linear-gradient(180deg, transparent, #3a342e 20%, #3a342e 80%, transparent)',
            }}
          />
        </div>

        <button
          onPointerDown={(e) => { e.stopPropagation(); adjustMix(-1); }}
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
