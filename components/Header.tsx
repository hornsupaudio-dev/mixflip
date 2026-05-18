'use client';

import { useState } from 'react';

export default function Header() {
  const [showKeys, setShowKeys] = useState(false);

  return (
    <header className="flex items-center justify-between py-5">
      <div className="flex items-baseline gap-3">
        <span className="font-display font-bold text-2xl tracking-tight text-cream" style={{ fontFamily: 'var(--font-display)' }}>
          Mix<span
            className="text-tape-red"
            style={{ textShadow: '0 0 20px rgba(217,58,44,0.6), 0 0 7px rgba(217,58,44,0.35)' }}
          >Flip</span>
        </span>
        <span className="hidden sm:block text-white/25 text-[10px] font-mono uppercase tracking-[0.18em]">by HornsUP Audio</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowKeys((v) => !v)}
          className="btn-3d hidden sm:block"
        >
          {showKeys ? 'Hide keys' : 'Shortcuts'}
        </button>
      </div>

      {showKeys && (
        <div className="absolute top-16 right-4 z-50 hw-panel text-xs min-w-[220px]">
          <p className="text-cream/70 font-display font-semibold mb-3 text-sm" style={{ fontFamily: 'var(--font-display)' }}>Shortcuts</p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <Kbd k="Space" label="Play / pause" />
            <Kbd k="1–8" label="Switch track" />
            <Kbd k="Tab" label="Cycle next" />
            <Kbd k="\" label="Toggle group" />
            <Kbd k="M / R" label="Jump mix / ref" />
            <Kbd k="← →" label="Seek ±5 s" />
            <Kbd k="N" label="Add note" />
          </div>
        </div>
      )}
    </header>
  );
}

function Kbd({ k, label }: { k: string; label: string }) {
  return (
    <>
      <span className="font-mono btn-3d text-center text-cream/70 px-2 py-1 text-[10px]">{k}</span>
      <span className="text-white/40 font-mono text-[10px] uppercase tracking-wider">{label}</span>
    </>
  );
}
