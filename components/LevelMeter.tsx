'use client';

import { useSyncExternalStore } from 'react';
import { audioEngine, type MeterSnapshot } from '@/lib/audioEngine';

const SILENT: MeterSnapshot = {
  rmsL: -100, rmsR: -100, peakL: -100, peakR: -100, holdL: -100, holdR: -100, clip: false,
};

const DB_FLOOR = -48;
const SEGMENTS = 22;

function dbToFrac(db: number): number {
  if (db <= DB_FLOOR) return 0;
  if (db >= 0) return 1;
  return (db - DB_FLOOR) / -DB_FLOOR;
}

function segColor(frac: number): string {
  if (frac < 0.80) return '#3fae54';
  if (frac < 0.93) return '#e0a32a';
  return '#e8382c';
}

function fmtDb(db: number): string {
  if (db <= DB_FLOOR) return '−∞';
  if (db >= 0) return `+${db.toFixed(1)}`;
  return db.toFixed(1);
}

function MeterRow({ label, rms, peak, hold }: { label: string; rms: number; peak: number; hold: number }) {
  const rmsLit  = dbToFrac(rms) * SEGMENTS;
  const peakSeg = peak > DB_FLOOR ? Math.min(SEGMENTS - 1, Math.round(dbToFrac(peak) * (SEGMENTS - 1))) : -1;
  const holdSeg = hold > DB_FLOOR ? Math.min(SEGMENTS - 1, Math.round(dbToFrac(hold) * (SEGMENTS - 1))) : -1;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="font-mono text-[8px] shrink-0 text-center"
        style={{ width: 7, color: 'rgba(232,221,208,0.4)' }}
      >
        {label}
      </span>
      <div className="flex gap-[1.5px] flex-1">
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const frac = i / (SEGMENTS - 1);
          const c = segColor(frac);
          const lit = i < rmsLit;
          const isPeak = i === peakSeg;
          const isHold = i === holdSeg && !lit && !isPeak;

          let bg = '#191512';
          let shadow = 'none';
          if (lit)    { bg = c; shadow = `0 0 3px ${c}aa`; }
          if (isHold) { bg = `${c}99`; }
          if (isPeak) { bg = '#fff5e8'; shadow = '0 0 4px rgba(255,245,232,0.9)'; }

          return (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{ height: 6, background: bg, boxShadow: shadow }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function LevelMeter() {
  const m = useSyncExternalStore(
    audioEngine.subscribeToMeter,
    audioEngine.getMeterSnapshot,
    () => SILENT,
  );

  const peakMax = Math.max(m.holdL, m.holdR);
  const hot = peakMax > -0.1;

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg shrink-0"
      style={{
        background: '#06040a',
        border: '1px solid #100d18',
        borderTopColor: '#1e1a2c',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
      }}
      role="meter"
      aria-label="Stereo output level"
    >
      <div className="flex flex-col gap-[3px] flex-1 min-w-0">
        <MeterRow label="L" rms={m.rmsL} peak={m.peakL} hold={m.holdL} />
        <MeterRow label="R" rms={m.rmsR} peak={m.peakR} hold={m.holdR} />
      </div>

      <div className="flex flex-col items-end shrink-0" style={{ width: 44 }}>
        <span
          className="font-mono tabular-nums text-[11px] leading-none"
          style={{ color: hot ? '#e8382c' : 'rgba(232,221,208,0.6)' }}
        >
          {fmtDb(peakMax)}
        </span>
        <span
          className="font-mono text-[7px] uppercase tracking-wider leading-none mt-1"
          style={{ color: 'rgba(232,221,208,0.25)' }}
        >
          peak db
        </span>
      </div>

      <div
        className="shrink-0 rounded-full"
        title={m.clip ? 'Clipping — signal hit 0 dBFS' : 'Clip indicator'}
        style={{
          width: 8, height: 8,
          background: m.clip ? '#ff4a3a' : '#2a1410',
          boxShadow: m.clip
            ? '0 0 7px #e8382c, 0 0 2px #ff6050'
            : 'inset 0 1px 1px rgba(0,0,0,0.6)',
          transition: 'background 60ms, box-shadow 60ms',
        }}
      />
    </div>
  );
}
