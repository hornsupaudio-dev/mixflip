'use client';

import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { audioEngine } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';
import type { SpeakerSim } from '@/lib/audioEngine';

const SIMS: { value: Exclude<SpeakerSim, 'off'>; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'room', label: 'Room' },
  { value: 'arena', label: 'Arena' },
];

export default function IRLoader() {
  const { customIRs, addCustomIR } = useMixFlipStore(useShallow((s) => ({
    customIRs: s.customIRs,
    addCustomIR: s.addCustomIR,
  })));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSimRef = useRef<Exclude<SpeakerSim, 'off'> | null>(null);
  const [loadingIR, setLoadingIR] = useState<string | null>(null);

  const handleLoadIR = (sim: Exclude<SpeakerSim, 'off'>) => {
    pendingSimRef.current = sim;
    fileInputRef.current?.click();
  };

  const handleIRFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sim = pendingSimRef.current;
    if (!file || !sim) return;
    setLoadingIR(sim);
    try {
      const buffer = await audioEngine.decodeFile(file);
      audioEngine.setSimIR(sim, buffer);
      addCustomIR(sim);
    } catch {
      // silently ignore unsupported files
    } finally {
      setLoadingIR(null);
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-mono text-white/15 uppercase tracking-[0.18em]">Load IR</span>
      {SIMS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleLoadIR(value)}
          className="text-[9px] font-mono text-white/20 hover:text-white/50 uppercase tracking-wider transition-colors flex items-center gap-1.5"
        >
          {loadingIR === value ? '…' : label}
          {customIRs.includes(value) && (
            <span
              className="w-1 h-1 rounded-full inline-block"
              style={{ background: '#e8a04a', boxShadow: '0 0 4px rgba(232,160,74,0.6)' }}
            />
          )}
        </button>
      ))}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,.aif,.aiff,.flac,.mp3"
        className="hidden"
        onChange={handleIRFile}
      />
    </div>
  );
}
