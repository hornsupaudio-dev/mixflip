'use client';

import Header from '@/components/Header';
import Waveform from '@/components/Waveform';
import LevelMeter from '@/components/LevelMeter';
import PlayerControls from '@/components/PlayerControls';
import MonitoringBar from '@/components/MonitoringBar';
import TimestampNotes from '@/components/TimestampNotes';
import TrackSlotStrip from '@/components/TrackSlotStrip';
import NowPlayingStrip from '@/components/NowPlayingStrip';

export default function Home() {
  return (
    <main className="flex flex-col h-dvh sm:h-auto sm:min-h-screen overflow-x-hidden">
      <div className="w-full max-w-3xl mx-auto px-4 flex flex-col flex-1 min-h-0">

        {/* Desktop header — hidden on mobile */}
        <div className="hidden sm:block">
          <Header />
        </div>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-visible flex flex-col gap-4 py-4 sm:py-0">

          {/* Mobile slot strip — 6 slots, default 4 mix / 2 ref */}
          <div className="sm:hidden shrink-0">
            <TrackSlotStrip totalSlots={6} defaultMixSlots={4} storageKey="mf-mix-slots" />
          </div>

          {/* Desktop slot strip — 10 slots, default 6 mix / 4 ref */}
          <div className="hidden sm:block shrink-0">
            <TrackSlotStrip totalSlots={10} defaultMixSlots={6} storageKey="mf-mix-slots-desktop" />
          </div>

          {/* Mobile: NowPlayingStrip — LED marquee now carries the file info */}
          <div className="sm:hidden shrink-0">
            <NowPlayingStrip />
          </div>

          {/* Waveform — always visible */}
          <Waveform />

          {/* Stereo level meter — RMS bars + peak ticks + clip LED */}
          <LevelMeter />

          {/* Desktop: Player + Monitoring (LED marquee carries the file info) */}
          <div className="hidden sm:flex flex-col gap-4">
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
          className="sm:hidden shrink-0 flex flex-col gap-3 pt-3 pb-2 border-t"
          style={{ borderTopColor: '#1a1714' }}
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
