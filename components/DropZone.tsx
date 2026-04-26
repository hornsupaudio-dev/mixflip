'use client';

import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore, type TrackType } from '@/store/mixflipStore';

const ACCEPTED_EXTS = /\.(mp3|wav|flac|aif|aiff|ogg|m4a|opus)$/i;

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || ACCEPTED_EXTS.test(file.name);
}

interface Props {
  trackType?: TrackType;
  maxTracks?: number;
  /** Compact = thin bar style used after tracks are loaded. Full = big centered drop zone. */
  compact?: boolean;
}

export default function DropZone({ trackType = 'mix', maxTracks = 8, compact = false }: Props) {
  const { tracks, addTracks, refPulsing } = useMixFlipStore(useShallow((s) => ({
    tracks: s.tracks,
    addTracks: s.addTracks,
    refPulsing: s.refPulsing,
  })));

  const [dragging, setDragging] = useState(false);
  const groupCount = tracks.filter((t) => t.type === trackType).length;
  const slots = maxTracks - groupCount;
  const full = slots <= 0;

  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudioFile).slice(0, slots);
    if (arr.length > 0) addTracks(arr, trackType);
  }, [slots, addTracks, trackType]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  const shouldPulse = trackType === 'reference' && refPulsing && !full;

  if (compact) {
    return (
      <label
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'flex items-center gap-2 cursor-pointer select-none transition-all',
          'btn-3d',
          full ? 'pointer-events-none opacity-25' : '',
          dragging ? 'brightness-125' : '',
          shouldPulse ? 'btn-ref-pulse' : '',
        ].join(' ')}
      >
        <input type="file" accept="audio/*" multiple className="sr-only" onChange={onInputChange} disabled={full} />
        <span>{full ? `${trackType === 'mix' ? 'Mix' : 'Ref'} limit reached` : `+ ${trackType === 'mix' ? 'Mix' : 'Ref'}`}</span>
      </label>
    );
  }

  return (
    <label
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed',
        'cursor-pointer select-none transition-all min-h-60',
        full ? 'pointer-events-none opacity-40 border-white/[0.06]' : '',
        dragging ? 'border-tape-red/50' : 'border-white/10 hover:border-white/20',
      ].join(' ')}
    >
      <input type="file" accept="audio/*" multiple className="sr-only" onChange={onInputChange} disabled={full} />
      <div className="text-4xl" style={{ filter: 'drop-shadow(0 0 8px rgba(217,58,44,0.4))', opacity: 0.4 }}>▶</div>
      <div className="text-center space-y-1">
        <p className="text-white/40 text-sm font-display font-medium tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>Drop audio files or click to browse</p>
        <p className="text-white/20 text-[11px] font-mono tracking-widest uppercase">MP3 · WAV · FLAC · AIFF · M4A</p>
      </div>
    </label>
  );
}
