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

  const { tracks, activeTrackId, seek, addTracks, setHoveredNoteId } = useMixFlipStore(useShallow((s) => ({
    tracks: s.tracks,
    activeTrackId: s.activeTrackId,
    seek: s.seek,
    addTracks: s.addTracks,
    setHoveredNoteId: s.setHoveredNoteId,
  })));
  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? null;

  const [dragging, setDragging] = useState(false);

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
    for (let i = 0; i < waveformData.length; i++) {
      const h = waveformData[i] * height * 0.85;
      ctx.fillStyle = activeTrack.color + '33';
      ctx.fillRect(i * barWidth, (height - h) / 2, Math.max(1, barWidth - 0.5), h);
    }

    ctx.restore();
  }, [activeTrackId, activeTrack?.color, activeTrack?.isLoading]);

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

    for (let i = 0; i < playedBars; i++) {
      const h = waveformData[i] * height * 0.85;
      ctx.fillStyle = activeTrack.color;
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

    ctx.restore();
  }, [currentTime, activeTrackId, activeTrack?.duration, activeTrack?.color, activeTrack?.notes]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTrack || activeTrack.duration <= 0) return;
    const rect = fgCanvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    seek((x / rect.width) * activeTrack.duration);
  }, [activeTrack?.duration, seek]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeTrack || activeTrack.duration <= 0 || activeTrack.notes.length === 0) return;
    const rect = fgCanvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const HIT_PX = 8;
    const hit = activeTrack.notes.find((n) => {
      const nx = (n.time / activeTrack.duration) * rect.width;
      return Math.abs(x - nx) <= HIT_PX;
    });
    setHoveredNoteId(hit?.id ?? null);
  }, [activeTrack?.duration, activeTrack?.notes, setHoveredNoteId]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNoteId(null);
  }, [setHoveredNoteId]);

  // ── Drop zone handlers ────────────────────────────────────────────────────
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(isAudioFile);
    if (arr.length > 0) addTracks(arr, 'mix');
  }, [addTracks]);

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

  const [labelHover, setLabelHover] = useState(false);
  const isEmpty = !activeTrack || activeTrack.isLoading || !getWaveform(activeTrack?.id ?? '');
  const isLoading = activeTrack?.isLoading;

  return (
    <div
      className="waveform-screen relative overflow-hidden h-28"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={dragging ? { boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18)' } : undefined}
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
                  color: dragging ? 'rgba(255,255,255,0.55)' : labelHover ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.22)',
                  transition: 'color 150ms',
                }}
              >
                Load Your Mixes
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/15">
                drag files here or click to browse
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
        style={{ cursor: isEmpty ? 'default' : 'pointer' }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
