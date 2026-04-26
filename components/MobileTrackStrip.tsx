'use client';

import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';

const ACCEPTED_EXTS = /\.(mp3|wav|flac|aif|aiff|ogg|m4a|opus)$/i;
function isAudioFile(f: File) { return f.type.startsWith('audio/') || ACCEPTED_EXTS.test(f.name); }

const MIX_SLOTS = 5;

function SlotBtn({
  label,
  color,
  isActive,
  isLoading,
  hasNotes,
  isEmpty,
  className = '',
  style = {},
  onPointerDown,
}: {
  label: string;
  color: string;
  isActive: boolean;
  isLoading: boolean;
  hasNotes: boolean;
  isEmpty: boolean;
  className?: string;
  style?: React.CSSProperties;
  onPointerDown: () => void;
}) {
  return (
    <button
      onPointerDown={onPointerDown}
      className={`relative flex items-center justify-center h-full transition-all duration-100 select-none ${className}`}
      style={{
        background: isActive ? `${color}26` : 'transparent',
        border: `1px solid ${isEmpty ? 'rgba(255,255,255,0.07)' : isActive ? `${color}88` : `${color}40`}`,
        borderRadius: '6px',
        cursor: isEmpty || isLoading ? 'pointer' : 'pointer',
        boxShadow: isActive ? `0 0 10px ${color}38, inset 0 0 0 1px ${color}1a` : 'none',
        touchAction: 'manipulation',
        ...style,
      }}
    >
      {/* Notes dot */}
      {hasNotes && !isEmpty && (
        <span
          className="absolute top-[5px] right-[5px] w-1 h-1 rounded-full"
          style={{ background: color, opacity: isActive ? 0.9 : 0.5 }}
        />
      )}

      {isLoading ? (
        <span
          className="font-mono text-[9px] tracking-widest animate-pulse"
          style={{ color: `${color}70` }}
        >
          ···
        </span>
      ) : (
        <span
          className="font-mono text-[10px] uppercase tracking-wider font-medium"
          style={{
            color: isEmpty
              ? 'rgba(255,255,255,0.14)'
              : isActive
                ? color
                : `${color}70`,
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

export default function MobileTrackStrip() {
  const { tracks, activeTrackId, addTracks, setActiveTrack } = useMixFlipStore(
    useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      addTracks: s.addTracks,
      setActiveTrack: s.setActiveTrack,
    })),
  );

  const mixInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const mixTracks = tracks.filter((t) => t.type === 'mix').slice(0, MIX_SLOTS);
  const refTrack = tracks.find((t) => t.type === 'reference') ?? null;

  const handleFiles = (files: FileList | null, type: 'mix' | 'reference') => {
    if (!files) return;
    const arr = Array.from(files).filter(isAudioFile);
    if (!arr.length) return;
    // For ref, only load the first file
    addTracks(type === 'reference' ? [arr[0]] : arr, type);
  };

  const vibrate = () => { try { navigator.vibrate?.(8); } catch {} };

  return (
    <div className="flex items-stretch gap-1.5 h-11">
      {/* Hidden file inputs */}
      <input
        ref={mixInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'mix'); e.target.value = ''; }}
      />
      <input
        ref={refInputRef}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'reference'); e.target.value = ''; }}
      />

      {/* ── Mix slots V1–V5 ────────────────────────────────────────────────── */}
      {Array.from({ length: MIX_SLOTS }).map((_, i) => {
        const track = mixTracks[i] ?? null;
        const isEmpty = !track;
        const isActive = track?.id === activeTrackId;
        const isLoading = track?.isLoading ?? false;
        const hasNotes = (track?.notes.length ?? 0) > 0;
        const color = track?.color ?? '#ffffff';

        return (
          <SlotBtn
            key={i}
            label={`V${i + 1}`}
            color={color}
            isActive={isActive}
            isLoading={isLoading}
            hasNotes={hasNotes}
            isEmpty={isEmpty}
            className="flex-1"
            onPointerDown={() => {
              vibrate();
              if (isEmpty) {
                mixInputRef.current?.click();
              } else if (!isLoading) {
                setActiveTrack(track!.id);
              }
            }}
          />
        );
      })}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div
        className="w-px shrink-0 self-stretch my-1"
        style={{ background: 'linear-gradient(180deg, transparent, #3a342e 20%, #3a342e 80%, transparent)' }}
      />

      {/* ── REF slot ───────────────────────────────────────────────────────── */}
      {(() => {
        const track = refTrack;
        const isEmpty = !track;
        const isActive = track?.id === activeTrackId;
        const isLoading = track?.isLoading ?? false;
        const hasNotes = (track?.notes.length ?? 0) > 0;
        const color = track?.color ?? '#6b7280';

        return (
          <SlotBtn
            label="REF"
            color={color}
            isActive={isActive}
            isLoading={isLoading}
            hasNotes={hasNotes}
            isEmpty={isEmpty}
            style={{ width: '3.25rem' }}
            onPointerDown={() => {
              vibrate();
              if (isEmpty) {
                refInputRef.current?.click();
              } else if (!isLoading) {
                setActiveTrack(track!.id);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
