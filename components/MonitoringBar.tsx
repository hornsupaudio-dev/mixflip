'use client';

import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';
import type { SpeakerSim } from '@/lib/audioEngine';

const SIMS: { value: Exclude<SpeakerSim, 'off'>; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'room', label: 'Room' },
  { value: 'arena', label: 'Arena' },
];

function Divider() {
  return (
    <div
      className="w-px h-4 shrink-0"
      style={{ background: 'linear-gradient(180deg, transparent, #3a342e 30%, #3a342e 70%, transparent)' }}
    />
  );
}

export default function MonitoringBar() {
  const {
    monoEnabled, speakerSim, simWetDry, volumeMatchEnabled, masterVolume, customIRs,
    toggleMono, setSpeakerSim, setSimWetDry, toggleVolumeMatch, setMasterVolume,
  } = useMixFlipStore(useShallow((s) => ({
    monoEnabled: s.monoEnabled,
    speakerSim: s.speakerSim,
    simWetDry: s.simWetDry,
    volumeMatchEnabled: s.volumeMatchEnabled,
    masterVolume: s.masterVolume,
    customIRs: s.customIRs,
    toggleMono: s.toggleMono,
    setSpeakerSim: s.setSpeakerSim,
    setSimWetDry: s.setSimWetDry,
    toggleVolumeMatch: s.toggleVolumeMatch,
    setMasterVolume: s.setMasterVolume,
  })));

  const simActive = speakerSim !== 'off';

  return (
    <div className="hw-panel flex items-center gap-3">
      {/* Volume */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Vol</span>
        <input
          type="range" min="0" max="1" step="0.01" value={masterVolume}
          onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
          className="hw-slider w-full"
          title={`Volume: ${Math.round(masterVolume * 100)}%`}
        />
        <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(masterVolume * 100)}%</span>
      </div>

      <Divider />

      <button
        onClick={toggleVolumeMatch}
        className={['btn-3d btn-3d-led', volumeMatchEnabled ? 'btn-3d-on' : ''].join(' ')}
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

      {/* Speaker sims */}
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

      {/* Wet/dry */}
      <div
        className="flex-1 min-w-0 flex flex-col gap-0.5 transition-opacity duration-150"
        style={{ opacity: simActive ? 1 : 0.28, pointerEvents: simActive ? 'auto' : 'none' }}
      >
        <div className="flex justify-between">
          <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider">Dry</span>
          <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Wet</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <input
            type="range" min="0" max="1" step="0.01" value={simWetDry}
            onChange={(e) => setSimWetDry(parseFloat(e.target.value))}
            className="hw-slider w-full"
            title={`Wet: ${Math.round(simWetDry * 100)}%`}
          />
          <span className="text-[9px] font-mono text-white/20 tabular-nums">{Math.round(simWetDry * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
