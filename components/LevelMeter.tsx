'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { audioEngine, type MeterSnapshot } from '@/lib/audioEngine';
import { useMixFlipStore } from '@/store/mixflipStore';

const SILENT: MeterSnapshot = {
  rmsL: -100, rmsR: -100, peakL: -100, peakR: -100, holdL: -100, holdR: -100, clip: false,
};

const DB_FLOOR = -48;
const SEGMENTS = 22;
const NEEDLE_HALF = 55; // ± degrees of needle sweep

// ── Shared math ─────────────────────────────────────────────────────────────
function dbToFrac(db: number): number {
  if (db <= DB_FLOOR) return 0;
  if (db >= 0) return 1;
  return (db - DB_FLOOR) / -DB_FLOOR;
}

function dbToAngle(db: number): number {
  return -NEEDLE_HALF + dbToFrac(db) * (NEEDLE_HALF * 2);
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

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = angleDeg * Math.PI / 180;
  return { x: cx + Math.sin(rad) * r, y: cy - Math.cos(rad) * r };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarPoint(cx, cy, r, startDeg);
  const e = polarPoint(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

// ── Mobile: segmented LED bars ──────────────────────────────────────────────
function SegmentedRow({ label, rms, peak, hold }: { label: string; rms: number; peak: number; hold: number }) {
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
          if (lit) { bg = c; shadow = `0 0 3px ${c}aa`; }
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

// ── Desktop: analog VU-style needle meter ───────────────────────────────────
function AnalogMeter({ label, rms, hold, color }: { label: string; rms: number; hold: number; color: string }) {
  const W = 220, H = 112;
  const cx = W / 2;
  const cy = H - 16;  // pivot near bottom
  const r = 86;        // needle / arc radius

  const angle = dbToAngle(rms);
  const holdAngle = dbToAngle(hold);

  const majorTicks: { db: number; text: string }[] = [
    { db: -36, text: '−36' },
    { db: -24, text: '−24' },
    { db: -12, text: '−12' },
    { db: -6,  text: '−6'  },
    { db: 0,   text: '0'   },
  ];
  const minorTicks = [-42, -30, -18, -9, -3];

  return (
    <div
      className="rounded-[5px] overflow-hidden shrink-0 relative"
      style={{
        width: W,
        height: H,
        background: '#0a0806',
        padding: 2,
        boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.55), 0 1px 0 rgba(255,240,220,0.05)',
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block" width="100%" height="100%">
        <defs>
          {/* Cream dial face with subtle aged gradient */}
          <linearGradient id={`face-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d8caaa" />
            <stop offset="0.55" stopColor="#bfae8c" />
            <stop offset="1" stopColor="#998866" />
          </linearGradient>
          {/* Glass highlight */}
          <linearGradient id={`glass-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.20" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
          </linearGradient>
          {/* Pivot cap — small dark metal dot */}
          <radialGradient id={`pivot-${label}`} cx="0.35" cy="0.32" r="0.7">
            <stop offset="0" stopColor="#65594a" />
            <stop offset="1" stopColor="#1a1410" />
          </radialGradient>
        </defs>

        {/* Cream dial face */}
        <rect x="0" y="0" width={W} height={H} rx="3" fill={`url(#face-${label})`} />

        {/* Main scale arc */}
        <path
          d={arcPath(cx, cy, r, dbToAngle(DB_FLOOR), dbToAngle(0))}
          stroke="#1a1410" strokeWidth="1.1" fill="none" opacity="0.85"
        />

        {/* Red zone arc (above -3 dB) */}
        <path
          d={arcPath(cx, cy, r, dbToAngle(-3), dbToAngle(0))}
          stroke="#c02818" strokeWidth="2.8" fill="none" opacity="0.95"
        />

        {/* Minor ticks */}
        {minorTicks.map(db => {
          const a = dbToAngle(db);
          const i = polarPoint(cx, cy, r - 4, a);
          const o = polarPoint(cx, cy, r, a);
          return (
            <line key={`mi-${db}`}
                  x1={i.x} y1={i.y} x2={o.x} y2={o.y}
                  stroke="#1a1410" strokeWidth="0.7" opacity="0.55" />
          );
        })}

        {/* Major ticks */}
        {majorTicks.map(({ db }) => {
          const a = dbToAngle(db);
          const i = polarPoint(cx, cy, r - 8, a);
          const o = polarPoint(cx, cy, r, a);
          return (
            <line key={`ma-${db}`}
                  x1={i.x} y1={i.y} x2={o.x} y2={o.y}
                  stroke={db === 0 ? '#c02818' : '#1a1410'}
                  strokeWidth="1.3" />
          );
        })}

        {/* Tick labels */}
        {majorTicks.map(({ db, text }) => {
          const a = dbToAngle(db);
          const p = polarPoint(cx, cy, r - 16, a);
          return (
            <text key={`tx-${db}`}
                  x={p.x} y={p.y + 2}
                  fontSize="7.5"
                  fontFamily="var(--font-mono)"
                  fill={db === 0 ? '#c02818' : '#1a1410'}
                  textAnchor="middle"
                  dominantBaseline="middle">
              {text}
            </text>
          );
        })}

        {/* Brand label */}
        <text x={cx} y={cy - 40}
              fontSize="6.5" fontFamily="var(--font-mono)"
              fill="#1a141055" textAnchor="middle"
              letterSpacing="0.22em">dBFS</text>

        {/* Big channel letter */}
        <text x={cx} y={cy - 26}
              fontSize="12" fontFamily="var(--font-mono)"
              fill="#1a1410" textAnchor="middle"
              fontWeight="700" letterSpacing="0.1em">{label}</text>

        {/* Peak-hold tick — small bright line at the arc, track-colored */}
        {hold > DB_FLOOR && (
          <line
            x1={cx} y1={cy - r + 1}
            x2={cx} y2={cy - r - 4}
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            transform={`rotate(${holdAngle} ${cx} ${cy})`}
            style={{ filter: `drop-shadow(0 0 2px ${color}cc)` }}
          />
        )}

        {/* Needle */}
        <line
          x1={cx} y1={cy + 2}
          x2={cx} y2={cy - r + 6}
          stroke="#181410"
          strokeWidth="1.4"
          strokeLinecap="round"
          transform={`rotate(${angle} ${cx} ${cy})`}
        />

        {/* Pivot cap */}
        <circle cx={cx} cy={cy} r="6" fill={`url(#pivot-${label})`} />
        <circle cx={cx - 1.5} cy={cy - 1.5} r="1.5" fill="rgba(255,255,255,0.28)" />

        {/* Glass overlay */}
        <rect x="0" y="0" width={W} height={H} rx="3"
              fill={`url(#glass-${label})`} pointerEvents="none" />
      </svg>
    </div>
  );
}

// ── Public component ────────────────────────────────────────────────────────
export default function LevelMeter() {
  const m = useSyncExternalStore(
    audioEngine.subscribeToMeter,
    audioEngine.getMeterSnapshot,
    () => SILENT,
  );

  // Active track color — used to tint the analog peak-hold tick
  const activeColor = useMixFlipStore((s) =>
    s.tracks.find(t => t.id === s.activeTrackId)?.color ?? '#6b7280',
  );

  // Defer SVG rendering until after hydration: React 19 is strict about
  // attribute serialisation in SVG (e.g. width="100%" + numeric viewBox),
  // and the meter shows silence on first frame anyway — no info lost.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="shrink-0" style={{ height: 36 }} aria-hidden />;
  }

  const peakMax = Math.max(m.holdL, m.holdR);
  const hot = peakMax > -0.1;

  return (
    <>
      {/* ── Mobile: segmented LED bars ───────────────────────────────────── */}
      <div
        className="sm:hidden flex items-center gap-2.5 px-3 py-2 rounded-lg shrink-0"
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
          <SegmentedRow label="L" rms={m.rmsL} peak={m.peakL} hold={m.holdL} />
          <SegmentedRow label="R" rms={m.rmsR} peak={m.peakR} hold={m.holdR} />
        </div>

        <div className="flex flex-col items-end shrink-0" style={{ width: 40 }}>
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
            width: 7, height: 7,
            background: m.clip ? '#ff4a3a' : '#2a1410',
            boxShadow: m.clip
              ? '0 0 7px #e8382c, 0 0 2px #ff6050'
              : 'inset 0 1px 1px rgba(0,0,0,0.6)',
            transition: 'background 60ms, box-shadow 60ms',
          }}
        />
      </div>

      {/* ── Desktop: analog VU-style needle meters ───────────────────────── */}
      <div
        className="hidden sm:flex items-center gap-3 px-3 py-2.5 rounded-lg"
        style={{
          background: '#0c0907',
          border: '1px solid #05030a',
          borderTopColor: '#2a241e',
          boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.92)',
        }}
        role="meter"
        aria-label="Stereo output level"
      >
        <AnalogMeter label="L" rms={m.rmsL} hold={m.holdL} color={activeColor} />
        <AnalogMeter label="R" rms={m.rmsR} hold={m.holdR} color={activeColor} />

        <div className="flex flex-col items-end ml-auto shrink-0">
          <span
            className="font-mono tabular-nums text-[15px] leading-none"
            style={{ color: hot ? '#e8382c' : 'rgba(232,221,208,0.7)' }}
          >
            {fmtDb(peakMax)}
          </span>
          <span
            className="font-mono text-[8px] uppercase tracking-[0.18em] leading-none mt-1.5"
            style={{ color: 'rgba(232,221,208,0.28)' }}
          >
            peak db
          </span>
        </div>

        <div
          className="shrink-0 rounded-full"
          title={m.clip ? 'Clipping — signal hit 0 dBFS' : 'Clip indicator'}
          style={{
            width: 9, height: 9,
            background: m.clip ? '#ff4a3a' : '#2a1410',
            boxShadow: m.clip
              ? '0 0 8px #e8382c, 0 0 3px #ff6050'
              : 'inset 0 1px 1px rgba(0,0,0,0.6)',
            transition: 'background 60ms, box-shadow 60ms',
          }}
        />
      </div>
    </>
  );
}
