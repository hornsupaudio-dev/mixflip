'use client';

import { useRef, useEffect, useCallback, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { getWaveform } from '@/lib/audioStore';
import { useMixFlipStore } from '@/store/mixflipStore';

const ACCEPTED_EXTS = /\.(mp3|wav|flac|aif|aiff|ogg|m4a|opus)$/i;
function isAudioFile(f: File) { return f.type.startsWith('audio/') || ACCEPTED_EXTS.test(f.name); }

export default function Waveform() {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef({ width: 0, height: 0, dpr: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Increments on every resize so canvas effects re-run after dimensions settle
  const [dimsKey, setDimsKey] = useState(0);

  const {
    tracks, activeTrackId, isPlaying, seek, addTracks, setHoveredNoteId,
    sections, addSection, removeSection,
  } = useMixFlipStore(useShallow((s) => ({
    tracks: s.tracks,
    activeTrackId: s.activeTrackId,
    isPlaying: s.isPlaying,
    seek: s.seek,
    addTracks: s.addTracks,
    setHoveredNoteId: s.setHoveredNoteId,
    sections: s.sections,
    addSection: s.addSection,
    removeSection: s.removeSection,
  })));
  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? null;

  // Long-press timer for deleting a section bar (touch)
  const sectionLongPressRef = useRef<number | null>(null);
  const cancelSectionLongPress = () => {
    if (sectionLongPressRef.current !== null) {
      clearTimeout(sectionLongPressRef.current);
      sectionLongPressRef.current = null;
    }
  };

  const [fileDragging, setFileDragging] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);

  const currentTime = useSyncExternalStore(
    audioEngine.subscribeToTime,
    audioEngine.getSnapshot,
    () => 0,
  );

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgCanvasRef.current;
    const bg = bgCanvasRef.current;
    if (!fg || !bg) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      fg.width = width * dpr;
      fg.height = height * dpr;
      bg.width = width * dpr;
      bg.height = height * dpr;
      dimsRef.current = { width, height, dpr };
      setDimsKey((k) => k + 1); // trigger dependent effects
    });

    ro.observe(fg);
    return () => ro.disconnect();
  }, []);

  // ── Background layer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || !activeTrack) return;
    const waveformData = getWaveform(activeTrack.id);
    if (!waveformData) return;

    const { width, height, dpr } = dimsRef.current;
    if (!width) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const barWidth = width / waveformData.length;
    ctx.fillStyle = activeTrack.color + '55'; // ~33% opacity — visible even before playback
    for (let i = 0; i < waveformData.length; i++) {
      const h = waveformData[i] * height * 0.85;
      ctx.fillRect(i * barWidth, (height - h) / 2, Math.max(1, barWidth - 0.5), h);
    }

    ctx.restore();
  }, [dimsKey, activeTrackId, activeTrack?.color, activeTrack?.isLoading]);

  // ── Foreground layer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = fgCanvasRef.current;
    if (!canvas || !activeTrack || activeTrack.duration <= 0) return;
    const waveformData = getWaveform(activeTrack.id);
    if (!waveformData) return;

    const { width, height, dpr } = dimsRef.current;
    if (!width) return;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const fraction = Math.min(currentTime / activeTrack.duration, 1);
    const barWidth = width / waveformData.length;
    const playedBars = Math.floor(fraction * waveformData.length);

    ctx.fillStyle = activeTrack.color;
    for (let i = 0; i < playedBars; i++) {
      const h = waveformData[i] * height * 0.85;
      ctx.fillRect(i * barWidth, (height - h) / 2, Math.max(1, barWidth - 0.5), h);
    }

    const playheadX = fraction * width;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.fillRect(playheadX - 1, 0, 2, height);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fbbf24';
    for (const note of activeTrack.notes) {
      const x = (note.time / activeTrack.duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 5, 9);
      ctx.lineTo(x + 5, 9);
      ctx.closePath();
      ctx.fill();
    }

    // ── Section markers (A, B, C, ...) — tall amber lines with letter tabs */
    if (sections.length > 0) {
      const tabH = 13;
      const tabW = 14;
      const sectionColor = '#e8a04a';
      sections.forEach((sec, idx) => {
        if (sec.time < 0 || sec.time > activeTrack.duration) return;
        const x = (sec.time / activeTrack.duration) * width;
        // Thin full-height bar below the tab
        ctx.fillStyle = sectionColor;
        ctx.fillRect(Math.round(x) - 0.5, tabH, 1.5, height - tabH);
        // Tab at top with letter inside
        ctx.fillRect(x - tabW / 2, 0, tabW, tabH);
        ctx.fillStyle = '#1a1410';
        ctx.font = 'bold 9px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String.fromCharCode(65 + idx), x, tabH / 2 + 0.5);
      });
    }

    ctx.restore();
  }, [dimsKey, currentTime, activeTrackId, activeTrack?.duration, activeTrack?.color, activeTrack?.notes, sections]);

  const getTimeFromPointer = useCallback((clientX: number): number => {
    const canvas = fgCanvasRef.current;
    if (!canvas || !activeTrack || activeTrack.duration <= 0) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * activeTrack.duration;
  }, [activeTrack?.duration]);

  // Find a section near a given clientX (within ±12 px). Returns null if none.
  const sectionAtPointer = useCallback((clientX: number) => {
    const canvas = fgCanvasRef.current;
    if (!canvas || !activeTrack || activeTrack.duration <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const HIT_PX = 12;
    return sections.find((s) => {
      const sx = (s.time / activeTrack.duration) * rect.width;
      return Math.abs(x - sx) <= HIT_PX;
    }) ?? null;
  }, [sections, activeTrack?.duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeTrack || activeTrack.duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = getTimeFromPointer(e.clientX);
    setScrubbing(true);
    if (!isPlaying) audioEngine.previewSeek(t);
    // Touch: if pointer landed on a section bar, arm a long-press for delete
    const sec = sectionAtPointer(e.clientX);
    if (sec) {
      cancelSectionLongPress();
      sectionLongPressRef.current = window.setTimeout(() => {
        sectionLongPressRef.current = null;
        const idx = sections.indexOf(sec);
        const label = idx >= 0 ? String.fromCharCode(65 + idx) : '?';
        if (window.confirm(`Delete section ${label}?`)) removeSection(sec.id);
      }, 650);
    }
  }, [activeTrack?.duration, isPlaying, getTimeFromPointer, sectionAtPointer, sections, removeSection]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (scrubbing) {
      const t = getTimeFromPointer(e.clientX);
      if (!isPlaying) audioEngine.previewSeek(t);
      return;
    }
    // Note hover — mouse only (pointer type check avoids touch false-positives)
    if (e.pointerType === 'touch') return;
    if (!activeTrack || activeTrack.duration <= 0 || activeTrack.notes.length === 0) return;
    const rect = fgCanvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const HIT_PX = 8;
    const hit = activeTrack.notes.find((n) => {
      const nx = (n.time / activeTrack.duration) * rect.width;
      return Math.abs(x - nx) <= HIT_PX;
    });
    setHoveredNoteId(hit?.id ?? null);
  }, [scrubbing, isPlaying, getTimeFromPointer, activeTrack?.duration, activeTrack?.notes, setHoveredNoteId]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelSectionLongPress();
    if (!scrubbing) return;
    setScrubbing(false);
    seek(getTimeFromPointer(e.clientX));
  }, [scrubbing, getTimeFromPointer, seek]);

  // Double-click empty waveform area → add a section there.
  // If you double-click ON an existing section, no-op (the dedup in the
  // store catches the duplicate but skip the visual flash either way).
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTrack || activeTrack.duration <= 0) return;
    if (sectionAtPointer(e.clientX)) return;
    addSection(getTimeFromPointer(e.clientX));
  }, [activeTrack?.duration, sectionAtPointer, getTimeFromPointer, addSection]);

  // Right-click on a section → confirm + delete (desktop)
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const sec = sectionAtPointer(e.clientX);
    if (!sec) return;
    e.preventDefault();
    const idx = sections.indexOf(sec);
    const label = idx >= 0 ? String.fromCharCode(65 + idx) : '?';
    if (window.confirm(`Delete section ${label}?`)) removeSection(sec.id);
  }, [sectionAtPointer, sections, removeSection]);

  const handlePointerLeave = useCallback(() => {
    cancelSectionLongPress();
    if (!scrubbing) setHoveredNoteId(null);
  }, [scrubbing, setHoveredNoteId]);

  // ── Drop zone handlers ────────────────────────────────────────────────────
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudioFile);
    if (arr.length > 0) addTracks(arr, 'mix');
  }, [addTracks]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setFileDragging(true); };
  const onDragLeave = () => setFileDragging(false);
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  const [labelHover, setLabelHover] = useState(false);
  const isEmpty = !activeTrack || activeTrack.isLoading || !getWaveform(activeTrack?.id ?? '');
  const isLoading = activeTrack?.isLoading;

  return (
    <div
      className="waveform-screen relative overflow-hidden h-28"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={fileDragging ? { boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18)' } : undefined}
    >
      {/* Empty / loading state */}
      {isEmpty && (
        <label
          onMouseEnter={() => setLabelHover(true)}
          onMouseLeave={() => setLabelHover(false)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer"
          style={{ zIndex: 10 }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="sr-only"
            onChange={onInputChange}
          />
          {isLoading ? (
            <span className="font-mono text-[11px] text-white/30 uppercase tracking-widest">
              Decoding audio…
            </span>
          ) : (
            <>
              <span
                className="font-mono text-sm uppercase tracking-[0.18em]"
                style={{
                  color: fileDragging ? 'rgba(255,200,150,0.75)' : labelHover ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.22)',
                  transition: 'color 150ms',
                }}
              >
                {fileDragging ? 'Drop to Load' : 'Load Your Mixes'}
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-widest"
                style={{
                  color: fileDragging ? 'rgba(255,200,150,0.4)' : 'rgba(255,255,255,0.15)',
                  transition: 'color 150ms',
                }}
              >
                {fileDragging ? 'release to add as mix' : 'drag files here or click to browse'}
              </span>
              <span className="font-mono text-[9px] tracking-wider" style={{ color: 'rgba(255,255,255,0.08)' }}>
                MP3 · WAV · FLAC · AIFF · M4A
              </span>
            </>
          )}
        </label>
      )}

      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full" />
      <canvas
        ref={fgCanvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          cursor: isEmpty ? 'default' : scrubbing ? 'grabbing' : 'pointer',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelSectionLongPress}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
