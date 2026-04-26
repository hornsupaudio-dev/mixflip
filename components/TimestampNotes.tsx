'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function truncateMiddle(s: string, maxLen = 26): string {
  if (s.length <= maxLen) return s;
  const keep = Math.floor((maxLen - 1) / 2);
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
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

  const currentTime = useSyncExternalStore(
    audioEngine.subscribeToTime,
    audioEngine.getSnapshot,
    () => 0,
  );

  const activeTrack = tracks.find((t) => t.id === activeTrackId);
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

  return (
    <div
      className="notes-screen"
      style={{
        boxShadow: screenShadow,
        opacity: isActive ? 1 : 0.32,
        transition: 'opacity 300ms ease, box-shadow 150ms',
      }}
    >
      <div className="flex gap-3 flex-1 min-h-0">

        {/* ── Left column: header + list + input ────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Header: dot + label + count */}
          <div className="notes-screen-header flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: phosphor, boxShadow: isActive ? `0 0 6px ${phosphor}` : 'none' }}
            />
            <span className="font-mono text-[12px] uppercase tracking-wider truncate" style={{ color: phosphor }}>
              {notesTrack ? `${truncateMiddle(notesTrack.label)} : Notes` : '— : Notes'}
            </span>
            {hasNotes && (
              <span className="font-mono text-[10px] shrink-0 ml-1" style={{ color: `${phosphor}45` }}>
                {notesTrack!.notes.length}
              </span>
            )}
          </div>

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
        </div>

        {/* ── Right sidebar: PIN / TXT / EMAIL always visible ───────────── */}
        <div className="flex flex-col gap-1.5 shrink-0 justify-end pb-px">
          {/* PIN — lit when active+pinned, dim when unavailable */}
          <button
            onClick={isActive ? handleTogglePin : undefined}
            title={isPinned ? 'Unpin — notes follow active track' : 'Pin notes to this track'}
            className="terminal-btn transition-all duration-150"
            style={{
              color: phosphor,
              ...((!isActive) && { opacity: 0.12, pointerEvents: 'none' }),
              ...(isActive && isPinned && {
                opacity: 1,
                boxShadow: `0 0 6px ${phosphor}55, inset 0 0 0 1px ${phosphor}55`,
                textShadow: `0 0 8px ${phosphor}`,
              }),
            }}
          >
            {isPinned ? 'PIN·D' : 'PIN'}
          </button>

          {/* TXT — only interactive when there are notes */}
          <button
            onClick={isActive && hasNotes ? handleExport : undefined}
            className="terminal-btn"
            title="Download .txt"
            style={{
              color: phosphor,
              ...(!isActive || !hasNotes ? { opacity: 0.12, pointerEvents: 'none' } : {}),
            }}
          >
            TXT
          </button>

          {/* EMAIL — only interactive when there are notes */}
          <button
            onClick={isActive && hasNotes ? handleEmailExport : undefined}
            className="terminal-btn"
            title="Share via email"
            style={{
              color: phosphor,
              ...(!isActive || !hasNotes ? { opacity: 0.12, pointerEvents: 'none' } : {}),
            }}
          >
            EMAIL
          </button>
        </div>

      </div>
    </div>
  );
}
