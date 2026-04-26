'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import Header from '@/components/Header';
import DropZone from '@/components/DropZone';
import VersionTabs from '@/components/VersionTabs';
import Waveform from '@/components/Waveform';
import TrackInfo from '@/components/TrackInfo';
import PlayerControls from '@/components/PlayerControls';
import MonitoringBar from '@/components/MonitoringBar';
import TimestampNotes from '@/components/TimestampNotes';

export default function Home() {
  const { hasMixes, hasRefs } = useMixFlipStore(useShallow((s) => ({
    hasMixes: s.tracks.some((t) => t.type === 'mix'),
    hasRefs: s.tracks.some((t) => t.type === 'reference'),
  })));

  const hasAny = hasMixes || hasRefs;

  return (
    <main className="min-h-screen flex flex-col overflow-x-hidden">
      <div className="w-full max-w-3xl mx-auto px-4 flex flex-col flex-1 pb-8">
        <Header />

        <div className="flex flex-col gap-4 flex-1">
          {/* ── References section ───────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-white/20 text-[10px] font-mono uppercase tracking-[0.22em] shrink-0">
                References
              </span>
              <div className="flex-1" style={{ borderTop: '1px solid rgba(58,52,46,0.6)' }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VersionTabs group="reference" />
              <DropZone trackType="reference" maxTracks={5} compact />
            </div>
          </div>

          {/* ── Mixes section ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-white/20 text-[10px] font-mono uppercase tracking-[0.22em] shrink-0">
                Mixes
              </span>
              <div className="flex-1" style={{ borderTop: '1px solid rgba(58,52,46,0.6)' }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VersionTabs group="mix" />
              <DropZone trackType="mix" maxTracks={8} compact />
            </div>
          </div>

          {/* ── Waveform — always visible, acts as drop zone when empty ──── */}
          <Waveform />

          {/* ── Player + monitoring — ghosted when nothing loaded ─────────── */}
          <div
            className="flex flex-col gap-4 transition-opacity duration-300"
            style={{
              opacity: hasAny ? 1 : 0.22,
              pointerEvents: hasAny ? 'auto' : 'none',
            }}
          >
            <TrackInfo />
            <PlayerControls />
            <MonitoringBar />
          </div>

          <div style={{ borderTop: '1px solid rgba(58,52,46,0.5)' }} />

          {/* ── Notes screen — manages its own ghost state ────────────────── */}
          <TimestampNotes />
        </div>

        <footer className="mt-auto pt-8 text-center">
          <p className="text-cream/[0.15] text-xs font-mono">
            MixFlip by{' '}
            <a
              href="https://hornsupaudio.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/30 transition-colors"
            >
              HornsUP Audio
            </a>
            {' '}— Your files never leave this device.
          </p>
        </footer>
      </div>
    </main>
  );
}
