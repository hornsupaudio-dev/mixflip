'use client';

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import type { SpeakerSim } from '@/lib/audioEngine';
import EQPanel from '@/components/EQPanel';

const SIMS: { value: Exclude<SpeakerSim, 'off'>; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'room', label: 'Room' },
  { value: 'arena', label: 'Arena' },
];

const SIM_CYCLE: SpeakerSim[] = ['off', 'car', 'room', 'arena'];

function Divider() {
  return (
    <div
      className="w-px h-4 shrink-0"
      style={{ background: 'linear-gradient(180deg, transparent, #3a342e 30%, #3a342e 70%, transparent)' }}
    />
  );
}

export default function MonitoringBar() {
  const [wetDryOpen, setWetDryOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);

  const {
    monoEnabled, speakerSim, simWetDry, volumeMatchEnabled, volMatchPulsing, masterVolume, customIRs,
    toggleMono, setSpeakerSim, setSimWetDry, toggleVolumeMatch, setMasterVolume,
  } = useMixFlipStore(useShallow((s) => ({
    monoEnabled: s.monoEnabled,
    speakerSim: s.speakerSim,
    simWetDry: s.simWetDry,
    volumeMatchEnabled: s.volumeMatchEnabled,
    volMatchPulsing: s.volMatchPulsing,
    masterVolume: s.masterVolume,
    customIRs: s.customIRs,
    toggleMono: s.toggleMono,
    setSpeakerSim: s.setSpeakerSim,
    setSimWetDry: s.setSimWetDry,
    toggleVolumeMatch: s.toggleVolumeMatch,
    setMasterVolume: s.setMasterVolume,
  })));

  const simActive = speakerSim !== 'off';
  const simIdx = SIM_CYCLE.indexOf(speakerSim);
  const simLabel = speakerSim === 'off' ? 'Flat' : speakerSim.charAt(0).toUpperCase() + speakerSim.slice(1);

  const cycleSim = () => {
    const next = SIM_CYCLE[(simIdx + 1) % SIM_CYCLE.length];
    setSpeakerSim(next);
  };

  return (
    <div className="hw-panel flex flex-col gap-3">

      {/* ── MOBILE layout ──────────────────────────────────────────────────── */}
      <div className="sm:hidden flex flex-col gap-2">

        {/* Row 1: toggles + cycling SIM + wet/dry chevron */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVolumeMatch}
            className={['btn-3d btn-3d-led', volumeMatchEnabled ? 'btn-3d-on' : '', volMatchPulsing && !volumeMatchEnabled ? 'btn-volmatch-pulse' : ''].join(' ')}
            title="LUFS volume matching"
          >
            <span className="text-[9px]">VolMatch</span>
          </button>

          <button
            onClick={toggleMono}
            className={['btn-3d btn-3d-led', monoEnabled ? 'btn-3d-on' : ''].join(' ')}
            title="Mono fold"
          >
            Mono
          </button>

          <Divider />

          {/* Cycling SIM button */}
          <button
            onClick={cycleSim}
            className={['btn-3d btn-3d-led flex items-center gap-1.5 flex-1 justify-center', simActive ? 'btn-3d-on' : ''].join(' ')}
            title="Cycle speaker simulation"
          >
            <span className="font-mono text-[9px] uppercase tracking-wider w-8 text-center shrink-0">{simLabel}</span>
            {/* Position dots */}
            <span className="flex items-center gap-[3px] shrink-0">
              {SIM_CYCLE.map((_, i) => (
                <span
                  key={i}
                  className="w-[5px] h-[5px] rounded-full inline-block transition-opacity duration-150"
                  style={{
                    opacity: i === simIdx ? 1 : 0.2,
                    background: simActive && i === simIdx ? '#e8382c' : 'currentColor',
                    boxShadow: simActive && i === simIdx ? '0 0 4px rgba(232,56,44,0.7)' : 'none',
                  }}
                />
              ))}
            </span>
            {simActive && customIRs.includes(speakerSim as Exclude<SpeakerSim, 'off'>) && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: '#e8a04a', boxShadow: '0 0 5px rgba(232,160,74,0.7)' }}
                title="Custom IR loaded"
              />
            )}
          </button>

          {/* Wet/dry chevron */}
          <button
            onClick={() => setWetDryOpen((v) => !v)}
            className={['btn-3d btn-3d-led px-2.5', wetDryOpen ? 'btn-3d-on' : ''].join(' ')}
            title={wetDryOpen ? 'Hide wet/dry' : 'Show wet/dry'}
            style={{ opacity: simActive ? 1 : 0.35, pointerEvents: simActive ? 'auto' : 'none' }}
          >
            <svg
              width="10" height="6" viewBox="0 0 10 6" fill="none"
              style={{ transform: wetDryOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <Divider />

          {/* EQ toggle */}
          <button
            onClick={() => setEqOpen((v) => !v)}
            className={['btn-3d btn-3d-led', eqOpen ? 'btn-3d-on' : ''].join(' ')}
            title={eqOpen ? 'Close EQ' : 'Open EQ'}
          >
            <span className="text-[9px]">EQ</span>
          </button>
        </div>

        {/* Row 2: Vol/Trim slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Trim</span>
            <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(masterVolume * 100)}%</span>
          </div>
          <input
            type="range" min="0" max="1" step="0.01" value={masterVolume}
            onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
            className="hw-slider w-full"
            title={`Volume: ${Math.round(masterVolume * 100)}%`}
          />
        </div>

        {/* Row 3: Wet/dry — revealed via chevron */}
        {wetDryOpen && (
          <div
            className="flex flex-col gap-1"
            style={{ opacity: simActive ? 1 : 0.28, pointerEvents: simActive ? 'auto' : 'none' }}
          >
            <div className="flex justify-between">
              <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider">Dry</span>
              <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(simWetDry * 100)}%</span>
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Wet</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01" value={simWetDry}
              onChange={(e) => setSimWetDry(parseFloat(e.target.value))}
              className="hw-slider w-full"
              title={`Wet: ${Math.round(simWetDry * 100)}%`}
            />
          </div>
        )}

        {/* EQ panel — revealed via EQ button */}
        {eqOpen && (
          <div className="border-t border-white/5 pt-2">
            <EQPanel />
          </div>
        )}
      </div>

      {/* ── DESKTOP layout ─────────────────────────────────────────────────── */}
      <div className="hidden sm:flex flex-col gap-3">
        {/* Row 1: buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleVolumeMatch}
            className={['btn-3d btn-3d-led', volumeMatchEnabled ? 'btn-3d-on' : '', volMatchPulsing && !volumeMatchEnabled ? 'btn-volmatch-pulse' : ''].join(' ')}
            title="LUFS volume matching"
          >
            Vol Match
          </button>

          <button
            onClick={toggleMono}
            className={['btn-3d btn-3d-led', monoEnabled ? 'btn-3d-on' : ''].join(' ')}
            title="Mono fold"
          >
            Mono
          </button>

          <Divider />

          <button
            onClick={() => setSpeakerSim('off')}
            className={['btn-3d btn-3d-led', speakerSim === 'off' ? 'btn-3d-on' : ''].join(' ')}
            title="No speaker simulation"
          >
            Flat
          </button>

          <div className="seg-control shrink-0">
            {SIMS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSpeakerSim(value)}
                className={['seg-btn', speakerSim === value ? 'seg-btn-on' : ''].join(' ')}
              >
                {label}
                {customIRs.includes(value) && (
                  <span
                    className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: '#e8a04a', boxShadow: '0 0 5px rgba(232,160,74,0.7)' }}
                    title="Custom IR loaded"
                  />
                )}
              </button>
            ))}
          </div>

          <Divider />

          <button
            onClick={() => setEqOpen((v) => !v)}
            className={['btn-3d btn-3d-led', eqOpen ? 'btn-3d-on' : ''].join(' ')}
            title={eqOpen ? 'Close EQ' : 'Open parametric EQ'}
          >
            EQ
          </button>
        </div>

        {/* EQ panel — revealed via EQ button */}
        {eqOpen && (
          <div className="border-t border-white/5 pt-1">
            <EQPanel />
          </div>
        )}

        {/* Row 2: sliders */}
        <div className="flex items-end gap-4">
          {/* Volume */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Vol</span>
              <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(masterVolume * 100)}%</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01" value={masterVolume}
              onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
              className="hw-slider w-full"
              title={`Volume: ${Math.round(masterVolume * 100)}%`}
            />
          </div>

          {/* Wet/dry */}
          <div
            className="flex-1 min-w-0 flex flex-col gap-1 transition-opacity duration-150"
            style={{ opacity: simActive ? 1 : 0.28, pointerEvents: simActive ? 'auto' : 'none' }}
          >
            <div className="flex justify-between">
              <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider">Dry</span>
              <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(simWetDry * 100)}%</span>
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Wet</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01" value={simWetDry}
              onChange={(e) => setSimWetDry(parseFloat(e.target.value))}
              className="hw-slider w-full"
              title={`Wet: ${Math.round(simWetDry * 100)}%`}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
