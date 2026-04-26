'use client';

import { useRef, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';

export default function NowPlaying() {
  const { activeTrack, pinnedNotesTrackId, tracks } = useMixFlipStore(useShallow((s) => ({
    activeTrack: s.tracks.find((t) => t.id === s.activeTrackId) ?? null,
    pinnedNotesTrackId: s.pinnedNotesTrackId,
    tracks: s.tracks,
  })));

  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [duration, setDuration] = useState(12);

  const phosphor = activeTrack?.color ?? '#3a342e';
  const label = activeTrack?.label ?? '';
  const pinnedTrack = pinnedNotesTrackId ? tracks.find((t) => t.id === pinnedNotesTrackId) : null;

  useEffect(() => {
    const text = textRef.current;
    const container = containerRef.current;
    if (!text || !container) return;

    const check = () => {
      const overflow = text.scrollWidth > container.clientWidth;
      setShouldScroll(overflow);
      // ~60px per second feels like a car radio
      setDuration(Math.max(8, text.scrollWidth / 60));
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, [label]);

  if (!activeTrack) return null;

  return (
    <div
      className="now-playing-screen flex items-center gap-3 px-4"
      style={{
        boxShadow: [
          '0 0 0 1px #0a0806',
          '0 0 0 3px #13100d',
          '0 0 28px rgba(0,0,0,0.85)',
          `0 0 40px ${phosphor}12`,
          'inset 0 3px 10px rgba(0,0,0,0.97)',
          'inset 0 0 0 1px rgba(0,0,0,0.7)',
        ].join(', '),
      }}
    >
      {/* Label pill */}
      <span
        className="font-mono text-[9px] uppercase tracking-[0.2em] shrink-0 opacity-40"
        style={{ color: phosphor }}
      >
        NOW PLAYING
      </span>

      {/* Divider */}
      <span className="shrink-0 opacity-20" style={{ color: phosphor }}>│</span>

      {/* Scrolling track name */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ maskImage: 'linear-gradient(90deg, transparent 0px, black 16px, black calc(100% - 16px), transparent 100%)' }}
      >
        <span
          ref={textRef}
          className="font-mono text-[13px] uppercase tracking-[0.12em] whitespace-nowrap inline-block"
          style={{
            color: phosphor,
            textShadow: `0 0 12px ${phosphor}88`,
            animationName: shouldScroll ? 'marquee-scroll' : 'none',
            animationDuration: `${duration}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
            animationDelay: '1.5s',
          }}
        >
          {label}
        </span>
      </div>

      {/* Pinned indicator */}
      {pinnedTrack && pinnedTrack.id !== activeTrack.id && (
        <>
          <span className="shrink-0 opacity-20" style={{ color: phosphor }}>│</span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.15em] shrink-0 opacity-60"
            style={{ color: pinnedTrack.color }}
            title={`Notes pinned to: ${pinnedTrack.label}`}
          >
            📌 {pinnedTrack.label.slice(0, 14)}{pinnedTrack.label.length > 14 ? '…' : ''}
          </span>
        </>
      )}
    </div>
  );
}
