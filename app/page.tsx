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
import MobileTrackStrip from '@/components/MobileTrackStrip';
import NowPlayingStrip from '@/components/NowPlayingStrip';

export default function Home() {
  const { hasMixes, hasRefs } = useMixFlipStore(useShallow((s) => ({
    hasMixes: s.tracks.some((t) => t.type === 'mix'),
    hasRefs: s.tracks.some((t) => t.type === 'reference'),
  })));

  const hasAny = hasMixes || hasRefs;

  return (
    <main className="flex flex-col h-dvh sm:h-auto sm:min-h-screen overflow-x-hidden">
      <div className="w-full max-w-3xl mx-auto px-4 flex flex-col flex-1 min-h-0">

        {/* Desktop header — hidden on mobile */}
        <div className="hidden sm:block">
          <Header />
        </div>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-visible flex flex-col gap-4 py-4 sm:py-0">

          {/* Mobile: segmented REF/MIX strip with scrollable tabs */}
          <div className="sm:hidden shrink-0">
            <MobileTrackStrip />
          </div>

          {/* Desktop: References + Mixes sections */}
          <div className="hidden sm:flex flex-col gap-4">
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
          </div>

          {/* Mobile: NowPlayingStrip + file info above the waveform */}
          <div className="sm:hidden shrink-0 flex flex-col gap-1.5">
            <NowPlayingStrip />
            <TrackInfo />
          </div>

          {/* Waveform — always visible */}
          <Waveform />

          {/* Desktop: TrackInfo + Player + Monitoring */}
          <div
            className="hidden sm:flex flex-col gap-4 transition-opacity duration-300"
            style={{
              opacity: hasAny ? 1 : 0.22,
              pointerEvents: hasAny ? 'auto' : 'none',
            }}
          >
            <TrackInfo />
            <PlayerControls />
            <MonitoringBar />
          </div>

          <div className="hidden sm:block" style={{ borderTop: '1px solid rgba(58,52,46,0.5)' }} />

          {/* Notes */}
          <TimestampNotes />

          {/* Footer */}
          <footer className="hidden sm:block mt-auto pt-8 pb-8 text-center">
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

        {/* ── Mobile sticky bottom: Player + Monitoring ───────────────────── */}
        {/* noKeyboard — keyboard is handled by the desktop PlayerControls instance */}
        <div
          className="sm:hidden shrink-0 flex flex-col gap-3 pt-3 pb-2 border-t transition-opacity duration-300"
          style={{
            borderTopColor: '#1a1714',
            opacity: hasAny ? 1 : 0.22,
            pointerEvents: hasAny ? 'auto' : 'none',
          }}
        >
          <PlayerControls noKeyboard />
          <MonitoringBar />

          {/* Privacy / branding line — discreet, always visible on mobile */}
          <p
            className="font-mono text-[8px] tracking-[0.2em] uppercase text-center select-none"
            style={{ color: 'rgba(232,221,208,0.18)', marginTop: -2 }}
          >
            files never leave your device
          </p>
        </div>

      </div>
    </main>
  );
}
