'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';
import LEDDisplay from '@/components/LEDDisplay';

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerControls({ noKeyboard = false }: { noKeyboard?: boolean }) {

  const { tracks, activeTrackId, activeGroup, isPlaying, togglePlay, seek, cycleTrack, switchGroup, triggerRefPulse } =
    useMixFlipStore(useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      activeGroup: s.activeGroup,
      isPlaying: s.isPlaying,
      togglePlay: s.togglePlay,
      seek: s.seek,
      cycleTrack: s.cycleTrack,
      switchGroup: s.switchGroup,
      triggerRefPulse: s.triggerRefPulse,
    })));

  const activeTrack = tracks.find((t) => t.id === activeTrackId) ?? null;
  const duration = activeTrack?.duration ?? 0;
  const hasBuffer = !!activeTrackId && !activeTrack?.isLoading;
  const hasBothGroups = tracks.some((t) => t.type === 'mix') && tracks.some((t) => t.type === 'reference');

  const liveTime = useSyncExternalStore(
    audioEngine.subscribeToTime,
    audioEngine.getSnapshot,
    () => 0,
  );

  // ── Scrubber state ────────────────────────────────────────────────────────
  const barRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  const displayTime = scrubbing ? scrubTime : liveTime;
  const fraction = duration > 0 ? Math.min(displayTime / duration, 1) : 0;

  const getTimeFromPointer = (clientX: number): number => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasBuffer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = getTimeFromPointer(e.clientX);
    setScrubTime(t);
    setScrubbing(true);
    if (!isPlaying) audioEngine.previewSeek(t);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    const t = getTimeFromPointer(e.clientX);
    setScrubTime(t);
    if (!isPlaying) audioEngine.previewSeek(t);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    setScrubbing(false);
    seek(getTimeFromPointer(e.clientX));
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (noKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (hasBuffer) togglePlay();
          break;
        case 'Tab':
          e.preventDefault();
          cycleTrack();
          break;
        case 'ArrowLeft':
          if (hasBuffer) seek(Math.max(0, liveTime - 5));
          break;
        case 'ArrowRight':
          if (hasBuffer && duration > 0) seek(Math.min(duration, liveTime + 5));
          break;
        default:
          if (e.code === 'Backslash' && hasBothGroups) {
            switchGroup();
          } else if (e.key >= '1' && e.key <= '8') {
            const groupTracks = useMixFlipStore.getState().tracks.filter(
              (t) => t.type === activeGroup,
            );
            const track = groupTracks[parseInt(e.key) - 1];
            if (track) useMixFlipStore.getState().setActiveTrack(track.id);
          }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [noKeyboard, hasBuffer, liveTime, duration, togglePlay, seek, cycleTrack, switchGroup, activeGroup, hasBothGroups]);

  return (
    <div className="flex items-center gap-4">
      {/* Play / pause */}
      <button
        onClick={togglePlay}
        disabled={!hasBuffer}
        className={[
          'w-16 h-16 rounded-full flex items-center justify-center shrink-0 select-none',
          hasBuffer
            ? ['play-btn', isPlaying ? 'play-btn-playing' : ''].join(' ')
            : 'cursor-not-allowed opacity-20 bg-[#1d1a16] border border-[#0d0b09]',
        ].join(' ')}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className="play-icon-pulse">
            <rect x="2" y="2" width="5" height="14" rx="1.5"/>
            <rect x="11" y="2" width="5" height="14" rx="1.5"/>
          </svg>
        ) : (
          <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" style={{ marginLeft: '3px' }}>
            <path d="M2 1.5L14 9L2 16.5V1.5Z"/>
          </svg>
        )}
      </button>

      {/* Time display + scrubber */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* LCD time · LED display · duration */}
        <div className="flex items-center gap-2">
          <span className="lcd shrink-0">{formatTime(displayTime)}</span>

          {/* LED dot-matrix display — desktop only; mobile uses NowPlayingStrip */}
          <div className="hidden sm:block pipboy-screen flex-1 overflow-hidden relative self-stretch">
            <LEDDisplay
              label={activeTrack?.label ?? ''}
              color={activeTrack?.color ?? 'rgba(255,255,255,0.15)'}
              isPlaying={isPlaying}
              activeTrackId={activeTrackId}
            />
          </div>

          <span className="hidden sm:block font-mono text-[11px] text-white/20 tabular-nums shrink-0">{formatTime(duration)}</span>
        </div>

        {/* Scrub bar — red behind glass */}
        <div
          ref={barRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={['relative h-4 rounded-md select-none', hasBuffer ? 'cursor-pointer' : 'cursor-default'].join(' ')}
          style={{
            touchAction: 'none',
            background: '#06040a',
            border: '1px solid #100d18',
            borderTopColor: '#1e1a2c',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.95)',
          }}
        >
          {/* Red played bar */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: 0,
              top: 2,
              bottom: 2,
              width: `${fraction * 100}%`,
              minWidth: fraction > 0 ? 2 : 0,
              background: 'linear-gradient(180deg, #6a1008 0%, #c02818 18%, #e8382c 36%, #ff6a55 50%, #e8382c 64%, #c02818 82%, #6a1008 100%)',
              boxShadow: '4px 0 14px rgba(217,58,44,0.65), 0 0 8px rgba(217,58,44,0.4)',
              borderRadius: '3px 0 0 3px',
              WebkitMaskImage: 'linear-gradient(90deg, transparent 0px, black 10px, black calc(100% - 10px), transparent 100%)',
              maskImage: 'linear-gradient(90deg, transparent 0px, black 10px, black calc(100% - 10px), transparent 100%)',
            }}
          />

          {/* Glass panel */}
          <div
            className="absolute inset-0 rounded-md pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.08) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,245,235,0.16), inset 0 -1px 0 rgba(0,0,0,0.3)',
            }}
          />

          {/* Tick marks */}
          {duration > 15 && (() => {
            const interval = duration >= 600 ? 30 : 10;
            const count = Math.floor(duration / interval) - (duration % interval === 0 ? 1 : 0);
            return Array.from({ length: count }).map((_, i) => {
              const sec = (i + 1) * interval;
              const pct = (sec / duration) * 100;
              const isMajor = sec % 60 === 0;
              return (
                <div
                  key={i}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${pct}%`,
                    width: '1px',
                    height: isMajor ? '52%' : '30%',
                    top: isMajor ? '24%' : '35%',
                    background: isMajor ? 'rgba(232,221,208,0.3)' : 'rgba(232,221,208,0.14)',
                    zIndex: 2,
                  }}
                />
              );
            });
          })()}

          {/* Needle */}
          {hasBuffer && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: `${fraction * 100}%`,
                width: '1px',
                transform: 'translateX(-0.5px)',
                background: 'rgba(255,255,255,0.9)',
                boxShadow: '0 0 5px rgba(255,255,255,0.55)',
                zIndex: 3,
              }}
            />
          )}

          {/* Thumb */}
          {hasBuffer && (
            <div
              className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{
                left: `calc(${fraction * 100}% - 8px)`,
                width: 16,
                height: 16,
                background: 'radial-gradient(circle at 38% 32%, #504a44, #2a2622)',
                border: '1px solid #0a0908',
                borderTopColor: '#6a6258',
                boxShadow: 'inset 0 1px 0 rgba(255,240,220,0.12), 0 2px 6px rgba(0,0,0,0.7)',
                zIndex: 3,
              }}
            />
          )}
        </div>
      </div>

      {/* Group toggle — desktop only; mobile uses MobileTrackStrip seg-control */}
      <div
        className="hidden sm:flex split-circle transition-opacity duration-200"
        style={{ opacity: hasBothGroups ? 1 : 0.2 }}
      >
        <button
          onClick={hasBothGroups ? switchGroup : triggerRefPulse}
          title={hasBothGroups ? 'Switch group (\\)' : 'Load a reference track to compare'}
          className={['split-circle-btn', activeGroup === 'reference' && hasBothGroups ? 'split-circle-btn-on' : ''].join(' ')}
        >
          Ref
        </button>
        <button
          onClick={hasBothGroups ? switchGroup : triggerRefPulse}
          title={hasBothGroups ? 'Switch group (\\)' : 'Load a reference track to compare'}
          className={['split-circle-btn', activeGroup === 'mix' && hasBothGroups ? 'split-circle-btn-on' : ''].join(' ')}
        >
          Mix
        </button>
      </div>
    </div>
  );
}
