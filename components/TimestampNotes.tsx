'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';
import SpectrumDisplay, { BAND_DEFS } from '@/components/SpectrumDisplay';

type ScreenMode = 'notes' | 'scope';

// Inline freq/gain/Q readout for the currently selected EQ band
function BandReadout({
  band, bandIndex, trackId, color,
}: {
  band: { freq: number; gain: number; q: number };
  bandIndex: number;
  trackId: string;
  color: string;
}) {
  const setTrackEQ = useMixFlipStore((s) => s.setTrackEQ);
  const def = BAND_DEFS[bandIndex];

  const fmtFreq = (hz: number) =>
    hz < 1000 ? `${Math.round(hz)}` : `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1).replace(/\.?0+$/, '')}k`;
  const fmtGain = (db: number) => `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;

  return (
    <div
      className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider shrink-0"
      style={{ color }}
    >
      <span className="opacity-50">{def.name}</span>
      <span className="tabular-nums" style={{ minWidth: 38, textAlign: 'right' }}>
        {fmtFreq(band.freq)}Hz
      </span>
      <span className="tabular-nums" style={{ minWidth: 40, textAlign: 'right' }}>
        {fmtGain(band.gain)}dB
      </span>
      {def.peaking && (
        <>
          <span className="opacity-50">Q</span>
          <input
            type="range" min="0.3" max="8" step="0.1"
            value={band.q}
            onChange={(e) => setTrackEQ(trackId, bandIndex, { q: parseFloat(e.target.value) })}
            className="crt-slider"
            style={{ width: 56, color }}
            aria-label={`${def.name} Q`}
          />
          <span className="tabular-nums opacity-70" style={{ minWidth: 18 }}>{band.q.toFixed(1)}</span>
        </>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const DEAD_COLOR = '#3a342e';

export default function TimestampNotes() {
  const { tracks, activeTrackId, isPlaying, addNote, removeNote, updateNote, hoveredNoteId, pinnedNotesTrackId, setPinnedNotesTrackId, seek, setActiveTrack } = useMixFlipStore(
    useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      isPlaying: s.isPlaying,
      addNote: s.addNote,
      removeNote: s.removeNote,
      updateNote: s.updateNote,
      hoveredNoteId: s.hoveredNoteId,
      pinnedNotesTrackId: s.pinnedNotesTrackId,
      setPinnedNotesTrackId: s.setPinnedNotesTrackId,
      seek: s.seek,
      setActiveTrack: s.setActiveTrack,
    })),
  );

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [litNotes, setLitNotes] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<ScreenMode>('notes');
  const [selectedBand, setSelectedBand] = useState<number | null>(null);
  const [resetFlash, setResetFlash] = useState(false);

  const resetTrackEQ  = useMixFlipStore((s) => s.resetTrackEQ);
  const toggleTrackEQ = useMixFlipStore((s) => s.toggleTrackEQ);

  const currentTime = useSyncExternalStore(
    audioEngine.subscribeToTime,
    audioEngine.getSnapshot,
    () => 0,
  );

  const activeTrack = tracks.find((t) => t.id === activeTrackId);
  const eqEnabled = !!activeTrack?.eq.enabled;
  const isPinned = !!pinnedNotesTrackId;
  const notesTrack = isPinned
    ? (tracks.find((t) => t.id === pinnedNotesTrackId) ?? activeTrack)
    : activeTrack;
  const isActive = !!notesTrack;
  const hasNotes = (notesTrack?.notes.length ?? 0) > 0;
  const phosphor = notesTrack?.color ?? DEAD_COLOR;

  const handleTogglePin = () => {
    if (isPinned) {
      setPinnedNotesTrackId(null);
    } else if (activeTrack) {
      setPinnedNotesTrackId(activeTrack.id);
    }
  };

  // ── Playhead-triggered highlight ─────────────────────────────────────────
  const prevTimeRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const prev = prevTimeRef.current;
    const curr = currentTime;
    prevTimeRef.current = curr;

    if (!notesTrack || !isPlaying || curr <= prev) return;

    const windowStart = Math.max(prev, curr - 0.5);
    const crossed = notesTrack.notes.filter((n) => n.time > windowStart && n.time <= curr);
    if (crossed.length === 0) return;

    setLitNotes((s) => {
      const next = new Set(s);
      crossed.forEach((n) => next.add(n.id));
      return next;
    });

    crossed.forEach((n) => {
      const existing = timersRef.current.get(n.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timersRef.current.delete(n.id);
        setLitNotes((s) => { const next = new Set(s); next.delete(n.id); return next; });
      }, 5000);
      timersRef.current.set(n.id, t);
    });
  }, [currentTime, isPlaying, notesTrack?.id, notesTrack?.notes]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!notesTrack || !hasNotes) return;
    const lines = notesTrack.notes.map((n) => `${formatTime(n.time)}\t${n.text}`).join('\r\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${notesTrack.label}_notes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEmailExport = () => {
    if (!notesTrack || !hasNotes) return;
    const lines = notesTrack.notes.map((n) => `${formatTime(n.time)} — ${n.text}`).join('\n');
    window.open(`mailto:?subject=${encodeURIComponent(`Notes: ${notesTrack.label}`)}&body=${encodeURIComponent(lines)}`);
  };

  const handleAdd = () => {
    if (!notesTrack) return;
    const text = draft.trim();
    if (!text) return;
    addNote(notesTrack.id, text, currentTime);
    setDraft('');
  };

  const commitEdit = (noteId: string) => {
    if (!notesTrack) return;
    const text = editDraft.trim();
    if (text) updateNote(notesTrack.id, noteId, text);
    setEditingId(null);
  };

  const screenShadow = [
    '0 0 0 1px #0a0806',
    '0 0 0 3px #13100d',
    '0 0 28px rgba(0,0,0,0.85)',
    `0 0 50px ${phosphor}${isActive ? '18' : '08'}`,
    'inset 0 4px 14px rgba(0,0,0,0.97)',
    'inset 0 0 0 1px rgba(0,0,0,0.7)',
  ].join(', ');

  // Track-color-aware divider for the segmented control wells
  const segDivider = `1px solid ${phosphor}30`;

  return (
    <div
      className="notes-screen"
      style={{
        boxShadow: screenShadow,
        opacity: isActive ? 1 : 0.32,
        transition: 'opacity 300ms ease, box-shadow 150ms',
      }}
    >
      {/* ── Header — pulled OUT of the body row so it always spans the full
            screen width regardless of whether the notes sidebar is rendered. */}
      <div className="notes-screen-header flex items-center gap-2 flex-wrap">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: phosphor, boxShadow: isActive ? `0 0 6px ${phosphor}` : 'none' }}
        />
        <span
          className="font-mono text-[12px] uppercase tracking-wider shrink-0"
          style={{ color: phosphor }}
        >
          {mode === 'notes' ? 'Notes' : 'Scope'}
        </span>

        {/* Right cluster: band readout (scope+selected) → [RESET|EQ] well → [NOTES|SCOPE] well */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {mode === 'scope' && selectedBand !== null && activeTrack && (
            <BandReadout
              band={activeTrack.eq.bands[selectedBand]}
              bandIndex={selectedBand}
              trackId={activeTrack.id}
              color={phosphor}
            />
          )}

          {mode === 'notes' && hasNotes && (
            <span className="font-mono text-[10px] shrink-0" style={{ color: `${phosphor}45` }}>
              {notesTrack!.notes.length}
            </span>
          )}

          {/* RESET | EQ — connected segmented well, matches NOTES|SCOPE styling */}
          <div
            className="flex items-center rounded-[3px] overflow-hidden shrink-0"
            style={{ border: segDivider }}
          >
            <button
              onClick={() => {
                if (!activeTrack) return;
                setResetFlash(true);
                resetTrackEQ(activeTrack.id);
                // In notes mode, also bypass EQ. The user isn't looking at the
                // spectrum so RESET reads as "kill the EQ entirely". In scope
                // mode we keep EQ engaged so the user can immediately keep dialing.
                if (mode === 'notes' && activeTrack.eq.enabled) {
                  toggleTrackEQ(activeTrack.id);
                }
                setTimeout(() => setResetFlash(false), 320);
              }}
              disabled={!activeTrack}
              title={mode === 'notes' ? 'Reset EQ bands and bypass' : 'Reset EQ bands to 0 dB'}
              aria-label={mode === 'notes' ? 'Reset and bypass EQ' : 'Reset EQ bands'}
              className="px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-wider"
              style={{
                background: resetFlash ? `${phosphor}45` : 'transparent',
                color: resetFlash
                  ? phosphor
                  : activeTrack ? `${phosphor}70` : `${phosphor}25`,
                textShadow: resetFlash ? `0 0 6px ${phosphor}` : 'none',
                transition: resetFlash
                  ? 'background 80ms, color 80ms, text-shadow 80ms'
                  : 'background 250ms, color 250ms, text-shadow 250ms',
                cursor: activeTrack ? 'pointer' : 'default',
              }}
            >
              Reset
            </button>
            <div className="w-px h-3" style={{ background: `${phosphor}30` }} />
            <button
              onClick={() => activeTrack && toggleTrackEQ(activeTrack.id)}
              disabled={!activeTrack}
              title={eqEnabled ? 'Bypass EQ' : 'Engage EQ'}
              aria-label="Toggle EQ"
              aria-pressed={eqEnabled}
              className="px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-wider transition-all duration-150"
              style={{
                background: eqEnabled ? `${phosphor}30` : 'transparent',
                color: eqEnabled
                  ? phosphor
                  : activeTrack ? `${phosphor}70` : `${phosphor}25`,
                textShadow: eqEnabled ? `0 0 4px ${phosphor}88` : 'none',
                cursor: activeTrack ? 'pointer' : 'default',
              }}
            >
              EQ
            </button>
          </div>

          {/* NOTES / SCOPE toggle */}
          <div
            className="flex items-center rounded-[3px] overflow-hidden shrink-0"
            style={{ border: segDivider }}
            role="tablist"
            aria-label="Screen mode"
          >
            <button
              onClick={() => setMode('notes')}
              className="px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-wider transition-all duration-150"
              style={{
                background: mode === 'notes' ? `${phosphor}30` : 'transparent',
                color: mode === 'notes' ? phosphor : `${phosphor}60`,
                textShadow: mode === 'notes' ? `0 0 4px ${phosphor}88` : 'none',
              }}
              role="tab"
              aria-selected={mode === 'notes'}
            >
              Notes
            </button>
            <div className="w-px h-3" style={{ background: `${phosphor}30` }} />
            <button
              onClick={() => setMode('scope')}
              className="px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-wider transition-all duration-150"
              style={{
                background: mode === 'scope' ? `${phosphor}30` : 'transparent',
                color: mode === 'scope' ? phosphor : `${phosphor}60`,
                textShadow: mode === 'scope' ? `0 0 4px ${phosphor}88` : 'none',
              }}
              role="tab"
              aria-selected={mode === 'scope'}
            >
              Scope
            </button>
          </div>
        </div>
      </div>

      {/* ── Body row: content column + (notes-mode-only) sidebar ─────────── */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Body — spectrum (scope) or notes-list+input (notes) */}
        {mode === 'scope' ? (
          <div className="flex-1 min-h-0 relative" style={{ zIndex: 5 }}>
            <SpectrumDisplay
              selectedBand={selectedBand}
              onSelectBand={setSelectedBand}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <>
          {/* Note list */}
          {isActive && (
            <ul className="notes-screen-list space-y-1.5 pr-1">
              {notesTrack!.notes.map((note) => (
                <li
                  key={note.id}
                  onMouseEnter={() => setHoveredId(note.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={['group flex items-start gap-2.5', litNotes.has(note.id) || hoveredId === note.id || hoveredNoteId === note.id ? 'note-lit' : ''].join(' ')}
                >
                  <button
                    onClick={() => {
                      if (notesTrack!.id !== activeTrackId) {
                        setActiveTrack(notesTrack!.id);
                        setTimeout(() => seek(note.time), 0);
                      } else {
                        seek(note.time);
                      }
                    }}
                    className="font-mono text-[13px] shrink-0 mt-0.5 tabular-nums w-11 text-left transition-opacity hover:opacity-100"
                    style={{ color: phosphor, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    title="Jump to this timestamp"
                  >
                    {formatTime(note.time)}
                  </button>

                  {editingId === note.id ? (
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => commitEdit(note.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit(note.id);
                        if (e.key === 'Escape') setEditingId(null);
                        e.stopPropagation();
                      }}
                      className="flex-1 bg-transparent font-mono text-[13px] outline-none px-1 py-0.5"
                      style={{ color: phosphor, border: `1px solid ${phosphor}45`, background: `${phosphor}08`, borderRadius: '2px', caretColor: phosphor }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => { setEditingId(note.id); setEditDraft(note.text); }}
                      className="flex-1 font-mono text-[13px] leading-relaxed cursor-text"
                      style={{ color: phosphor }}
                      title="Double-click to edit"
                    >
                      {note.text}
                    </span>
                  )}

                  <button
                    onClick={() => removeNote(notesTrack!.id, note.id)}
                    className="opacity-0 group-hover:opacity-50 transition-opacity duration-150 shrink-0 font-mono text-[10px] mt-0.5"
                    style={{ color: phosphor }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Input row — press Enter to add */}
          <div className="notes-screen-input flex items-center gap-2">
            <span
              className="font-mono text-[13px] tabular-nums shrink-0 w-11"
              style={{ color: phosphor }}
            >
              {formatTime(currentTime)}<span style={{ opacity: 0.6 }}>›</span>
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'n' || e.key === 'N') e.stopPropagation();
              }}
              placeholder={isActive ? 'note at current position…' : ''}
              disabled={!isActive}
              className="flex-1 font-mono text-[13px] bg-transparent outline-none placeholder:opacity-30 disabled:cursor-default"
              style={{ color: phosphor, borderBottom: `1px solid ${phosphor}55`, paddingBottom: '2px', caretColor: phosphor }}
            />
          </div>
          </>
          </div>
          )}

        {/* ── Right sidebar: icon buttons (notes mode only) ──────────────── */}
        {mode === 'notes' && (
        <div className="flex flex-col gap-2 shrink-0 justify-end pb-0.5">
          {/* PIN */}
          <button
            onClick={isActive ? handleTogglePin : undefined}
            title={isPinned ? 'Unpin — notes follow active track' : 'Pin notes to this track'}
            aria-label={isPinned ? 'Unpin notes' : 'Pin notes to this track'}
            aria-pressed={isPinned}
            className="w-6 h-6 flex items-center justify-center transition-all duration-150"
            style={{
              color: phosphor,
              opacity: !isActive ? 0.12 : isPinned ? 1 : 0.4,
              pointerEvents: !isActive ? 'none' : 'auto',
              filter: isPinned && isActive ? `drop-shadow(0 0 4px ${phosphor})` : 'none',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {/* Thumbtack icon */}
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden>
              <circle cx="6" cy="4.5" r="2.8" fill="currentColor" fillOpacity={isPinned ? 0.35 : 0.15} stroke="currentColor" strokeWidth="1.1"/>
              <line x1="6" y1="7.3" x2="6" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="3.2" y1="7.5" x2="8.8" y2="7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
            </svg>
          </button>

          {/* TXT / Download */}
          <button
            onClick={isActive && hasNotes ? handleExport : undefined}
            title="Download notes as .txt"
            aria-label="Download notes as text file"
            className="w-6 h-6 flex items-center justify-center transition-opacity duration-150 hover:opacity-100"
            style={{
              color: phosphor,
              opacity: !isActive || !hasNotes ? 0.12 : 0.55,
              pointerEvents: !isActive || !hasNotes ? 'none' : 'auto',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {/* Download arrow icon */}
            <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden>
              <path d="M6 1V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M3 6L6 9L9 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="1" y1="12" x2="11" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>

          {/* EMAIL */}
          <button
            onClick={isActive && hasNotes ? handleEmailExport : undefined}
            title="Share notes via email"
            aria-label="Share notes via email"
            className="w-6 h-6 flex items-center justify-center transition-opacity duration-150 hover:opacity-100"
            style={{
              color: phosphor,
              opacity: !isActive || !hasNotes ? 0.12 : 0.55,
              pointerEvents: !isActive || !hasNotes ? 'none' : 'auto',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {/* Envelope icon */}
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden>
              <rect x="0.6" y="0.6" width="11.8" height="8.8" rx="1.2" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M1 1.5L6.5 5.5L12 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        )}

      </div>
    </div>
  );
}
