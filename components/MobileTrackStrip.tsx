'use client';

import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';

const ACCEPTED_EXTS = /\.(mp3|wav|flac|aif|aiff|ogg|m4a|opus)$/i;
function isAudioFile(f: File) { return f.type.startsWith('audio/') || ACCEPTED_EXTS.test(f.name); }

const TOTAL_SLOTS = 6;

function readStoredMixSlots(): number {
  try { return Math.max(1, Math.min(5, parseInt(localStorage.getItem('mf-mix-slots') ?? '4'))); }
  catch { return 4; }
}

function saveStoredMixSlots(n: number) {
  try { localStorage.setItem('mf-mix-slots', String(n)); } catch {}
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

  const [mixSlots, setMixSlots] = useState(readStoredMixSlots);
  const refSlots = TOTAL_SLOTS - mixSlots;

  const mixInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const mixTracks = tracks.filter((t) => t.type === 'mix').slice(0, mixSlots);
  const refTracks = tracks.filter((t) => t.type === 'reference').slice(0, refSlots);

  const handleFiles = (files: FileList | null, type: 'mix' | 'reference') => {
    if (!files) return;
    const arr = Array.from(files).filter(isAudioFile);
    if (!arr.length) return;
    addTracks(arr, type);
  };

  const vibrate = () => { try { navigator.vibrate?.(8); } catch {} };

  const adjustMix = (delta: number) => {
    const next = Math.max(1, Math.min(5, mixSlots + delta));
    if (next === mixSlots) return;
    setMixSlots(next);
    saveStoredMixSlots(next);
    vibrate();
  };

  return (
    <div className="flex items-stretch gap-1.5 h-11">
      {/* Hidden file inputs */}
      <input
        ref={mixInputRef}
        type="file" accept="audio/*" multiple className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'mix'); e.target.value = ''; }}
      />
      <input
        ref={refInputRef}
        type="file" accept="audio/*" className="sr-only"
        onChange={(e) => { handleFiles(e.target.files, 'reference'); e.target.value = ''; }}
      />

      {/* ── Mix slots ──────────────────────────────────────────────────────── */}
      {Array.from({ length: mixSlots }).map((_, i) => {
        const track = mixTracks[i] ?? null;
        const isEmpty = !track;
        const isActive = track?.id === activeTrackId;
        const isLoading = track?.isLoading ?? false;
        const hasNotes = (track?.notes.length ?? 0) > 0;
        const color = track?.color;

        return (
          <button
            key={`mix-${i}`}
            onPointerDown={() => {
              vibrate();
              if (isEmpty) mixInputRef.current?.click();
              else if (!isLoading) setActiveTrack(track!.id);
            }}
            title={isEmpty ? `Load mix ${i + 1}` : track!.label}
            className={['btn-3d flex-1 justify-center relative', isActive ? 'btn-3d-on' : ''].join(' ')}
            style={{
              padding: '0 4px',
              opacity: isEmpty ? 0.28 : 1,
              color: isEmpty ? undefined : isActive ? color : `${color}88`,
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
            {/* Notes dot */}
            {hasNotes && (
              <span
                className="absolute top-[4px] right-[4px] w-1 h-1 rounded-full pointer-events-none"
                style={{ background: color, opacity: isActive ? 0.9 : 0.5 }}
              />
            )}
            {isLoading ? (
              <span className="font-mono text-[9px] tracking-widest animate-pulse opacity-50">···</span>
            ) : (
              <span className="font-mono text-[10px] tracking-wider">V{i + 1}</span>
            )}
          </button>
        );
      })}

      {/* ── Divider with ◄ / ► controls ────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-between shrink-0 py-1" style={{ width: 18 }}>
        {/* Shift mix +1 (▲ = more mix) */}
        <button
          onPointerDown={() => adjustMix(1)}
          disabled={mixSlots >= 5}
          className="flex items-center justify-center leading-none"
          style={{
            width: 14, height: 14,
            color: 'rgba(232,221,208,0.35)',
            opacity: mixSlots >= 5 ? 0.12 : 1,
            fontSize: 9,
            background: 'none', border: 'none', cursor: mixSlots >= 5 ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
          title="More mix slots"
        >
          ◄
        </button>

        {/* Divider line */}
        <div
          className="w-px flex-1 my-0.5"
          style={{ background: 'linear-gradient(180deg, transparent, #3a342e 20%, #3a342e 80%, transparent)' }}
        />

        {/* Shift ref +1 (▼ = more ref) */}
        <button
          onPointerDown={() => adjustMix(-1)}
          disabled={mixSlots <= 1}
          className="flex items-center justify-center leading-none"
          style={{
            width: 14, height: 14,
            color: 'rgba(232,221,208,0.35)',
            opacity: mixSlots <= 1 ? 0.12 : 1,
            fontSize: 9,
            background: 'none', border: 'none', cursor: mixSlots <= 1 ? 'default' : 'pointer',
            touchAction: 'manipulation',
          }}
          title="More ref slots"
        >
          ►
        </button>
      </div>

      {/* ── Ref slots ──────────────────────────────────────────────────────── */}
      {Array.from({ length: refSlots }).map((_, i) => {
        const track = refTracks[i] ?? null;
        const isEmpty = !track;
        const isActive = track?.id === activeTrackId;
        const isLoading = track?.isLoading ?? false;
        const hasNotes = (track?.notes.length ?? 0) > 0;
        const color = track?.color ?? '#6b7280';

        return (
          <button
            key={`ref-${i}`}
            onPointerDown={() => {
              vibrate();
              if (isEmpty) refInputRef.current?.click();
              else if (!isLoading) setActiveTrack(track!.id);
            }}
            title={isEmpty ? 'Load reference track' : track!.label}
            className={['btn-3d justify-center relative', isActive ? 'btn-3d-on' : ''].join(' ')}
            style={{
              width: refSlots === 1 ? '3rem' : undefined,
              flex: refSlots > 1 ? 1 : undefined,
              padding: '0 4px',
              opacity: isEmpty ? 0.28 : 1,
              color: isEmpty ? undefined : isActive ? color : `${color}88`,
              boxShadow: isActive ? [
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
              <span className="font-mono text-[10px] tracking-wider">
                {refSlots === 1 ? 'REF' : `R${i + 1}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
