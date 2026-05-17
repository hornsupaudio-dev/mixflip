'use client';

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';
import { audioEngine } from '@/lib/audioEngine';
import { getSpectrumAvg, updateSpectrumAvg } from '@/lib/audioStore';

// ── Constants ───────────────────────────────────────────────────────────────
const SPEC_MIN_DB = -55;  // taller peaks; raised from -75
const EQ_RANGE_DB = 15;
const F_MIN = 20;
const F_MAX = 20000;

// Per-band freq clamps + which bands accept Q adjustment (peaking only)
export const BAND_DEFS = [
  { name: 'LO SHELF', freqMin: 20,   freqMax: 800,   peaking: false },
  { name: 'LO MID',   freqMin: 80,   freqMax: 3000,  peaking: true  },
  { name: 'HI MID',   freqMin: 500,  freqMax: 12000, peaking: true  },
  { name: 'HI SHELF', freqMin: 1500, freqMax: 20000, peaking: false },
] as const;

const logMin = Math.log10(F_MIN);
const logMax = Math.log10(F_MAX);

const freqToFrac = (f: number) => (Math.log10(f) - logMin) / (logMax - logMin);

function binAt(bins: Float32Array, binF: number): number {
  if (bins.length === 0) return -120;
  const clamped = Math.max(0, Math.min(bins.length - 1.001, binF));
  const b0 = Math.floor(clamped);
  const b1 = b0 + 1;
  const t = clamped - b0;
  return bins[b0] * (1 - t) + bins[b1] * t;
}

interface Props {
  selectedBand: number | null;
  onSelectBand: (i: number | null) => void;
}

// ── Draggable EQ node ───────────────────────────────────────────────────────
function EQNode({
  bandIndex, freq, gain, q, containerW, containerH, color, enabled, trackId,
  isSelected, onSelect,
}: {
  bandIndex: number;
  freq: number;
  gain: number;
  q: number;
  containerW: number;
  containerH: number;
  color: string;
  enabled: boolean;
  trackId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const setTrackEQ = useMixFlipStore((s) => s.setTrackEQ);
  const toggleTrackEQ = useMixFlipStore((s) => s.toggleTrackEQ);
  const def = BAND_DEFS[bandIndex];
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Refs for stable native event listener closure
  const qRef = useRef(q);
  const enabledRef = useRef(enabled);
  useEffect(() => { qRef.current = q; }, [q]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const x = freqToFrac(freq) * containerW;
  const y = containerH / 2 - (gain / EQ_RANGE_DB) * (containerH / 2);

  const dragStart = useRef<{ x: number; y: number; freq: number; gain: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onSelect();
    if (!enabled) {
      toggleTrackEQ(trackId);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, freq, gain };
    setDragging(true);
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    const fracDx = dx / containerW;
    const newLogFreq = Math.log10(s.freq) + fracDx * (logMax - logMin);
    const newFreq = Math.max(def.freqMin, Math.min(def.freqMax, Math.pow(10, newLogFreq)));

    const dGain = -dy / (containerH / 2) * EQ_RANGE_DB;
    const newGain = Math.max(-12, Math.min(12, s.gain + dGain));

    setTrackEQ(trackId, bandIndex, {
      freq: Math.round(newFreq),
      gain: Math.round(newGain * 10) / 10,
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    dragStart.current = null;
    setDragging(false);
  };

  const onDoubleClick = () => {
    setTrackEQ(trackId, bandIndex, { gain: 0 });
  };

  // Native, non-passive wheel listener so preventDefault actually stops
  // the page from scrolling under the cursor.
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!enabledRef.current || !def.peaking) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 0.5 : 0.1;
      const delta = e.deltaY > 0 ? -step : step;
      const newQ = Math.max(0.3, Math.min(8, qRef.current + delta));
      if (newQ !== qRef.current) {
        setTrackEQ(trackId, bandIndex, { q: Math.round(newQ * 100) / 100 });
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [bandIndex, def.peaking, trackId, setTrackEQ]);

  const size = dragging ? 18 : isSelected ? 15 : 13;

  return (
    <div
      ref={nodeRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      role="slider"
      aria-label={`EQ band ${bandIndex + 1}`}
      aria-valuenow={Math.round(gain)}
      aria-valuemin={-12}
      aria-valuemax={12}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: enabled ? color : 'transparent',
        border: `1.5px solid ${enabled ? '#f5ecdc' : `${color}aa`}`,
        cursor: !enabled ? 'pointer' : dragging ? 'grabbing' : 'grab',
        boxShadow: enabled
          ? (dragging
              ? `0 0 12px ${color}, 0 0 24px ${color}66, inset 0 0 4px rgba(255,255,255,0.4)`
              : isSelected
                ? `0 0 0 3px rgba(245,236,220,0.25), 0 0 7px ${color}cc`
                : `0 0 5px ${color}aa`)
          : isSelected
            ? `0 0 0 3px rgba(245,236,220,0.18)`
            : 'none',
        opacity: enabled ? 1 : 0.55,
        touchAction: 'none',
        zIndex: 10,
        transition: 'width 120ms, height 120ms, box-shadow 120ms',
      }}
    />
  );
}

// ── Public component ────────────────────────────────────────────────────────
export default function SpectrumDisplay({ selectedBand, onSelectBand }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssDims, setCssDims] = useState({ w: 0, h: 0 });

  const { bands, eqEnabled, trackId, color } = useMixFlipStore(useShallow((s) => {
    const t = s.tracks.find((x) => x.id === s.activeTrackId);
    return {
      bands: t?.eq.bands ?? null,
      eqEnabled: !!t?.eq.enabled,
      trackId: t?.id ?? null,
      color: t?.color ?? '#6b7280',
    };
  }));

  const resetTrackEQ  = useMixFlipStore((s) => s.resetTrackEQ);
  const toggleTrackEQ = useMixFlipStore((s) => s.toggleTrackEQ);

  // ── Canvas drawing (RAF-driven, reads store directly) ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let freqs: Float32Array<ArrayBuffer> | null = null;
    let eqMag: Float32Array<ArrayBuffer> | null = null;
    let cw = 0, ch = 0;

    const recomputeEQ = () => {
      const state = useMixFlipStore.getState();
      const t = state.tracks.find((x) => x.id === state.activeTrackId);
      if (!eqMag) return;
      if (!t || !freqs) { eqMag.fill(0); return; }
      audioEngine.getEQResponseFromParams(t.eq.bands, freqs, eqMag);
    };

    const onResize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      cw = w; ch = h;
      setCssDims({ w: rect.width, h: rect.height });

      freqs = new Float32Array(w);
      eqMag = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        freqs[x] = Math.pow(10, logMin + (x / Math.max(1, w - 1)) * (logMax - logMin));
      }
      recomputeEQ();
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    const unsubStore = useMixFlipStore.subscribe((state, prev) => {
      const t  = state.tracks.find((x) => x.id === state.activeTrackId);
      const pt = prev.tracks.find((x) => x.id === prev.activeTrackId);
      if (t?.eq.bands !== pt?.eq.bands || t?.id !== pt?.id) recomputeEQ();
    });

    const freqToX = (f: number) => ((Math.log10(f) - logMin) / (logMax - logMin)) * cw;

    const draw = () => {
      if (cw === 0 || ch === 0 || !freqs || !eqMag) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      const state = useMixFlipStore.getState();
      const t = state.tracks.find((x) => x.id === state.activeTrackId);
      const c = t?.color ?? '#6b7280';
      const eqOn = !!t?.eq.enabled;

      ctx.clearRect(0, 0, cw, ch);

      // ── Reference grid ─────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,240,220,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ch / 2);
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();
      [100, 1000, 10000].forEach((f) => {
        const x = freqToX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      });

      // ── Spectrum ──────────────────────────────────────────────────────
      const bins = audioEngine.getSpectrumBins();
      if (bins && t?.id && audioEngine.isPlaying) updateSpectrumAvg(t.id, bins);

      if (bins) {
        const binCount = bins.length;
        const nyquist = audioEngine.sampleRate / 2;
        const dbToY = (db: number) => {
          if (db <= SPEC_MIN_DB) return ch;
          if (db >= 0) return 0;
          return ch - ((db - SPEC_MIN_DB) / -SPEC_MIN_DB) * ch;
        };

        ctx.beginPath();
        for (let x = 0; x < cw; x++) {
          const binF = (freqs[x] / nyquist) * binCount;
          const y = dbToY(binAt(bins, binF));
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(cw, ch);
        ctx.lineTo(0, ch);
        ctx.closePath();
        ctx.fillStyle = `${c}22`;
        ctx.fill();

        const avg = t?.id ? getSpectrumAvg(t.id) : undefined;
        if (avg && avg.n > 4) {
          ctx.beginPath();
          for (let x = 0; x < cw; x++) {
            const binF = (freqs[x] / nyquist) * binCount;
            const y = dbToY(binAt(avg.avg, binF));
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // ── EQ curve ──────────────────────────────────────────────────────
      const midY = ch / 2;
      const halfH = ch / 2;
      ctx.beginPath();
      for (let x = 0; x < cw; x++) {
        const eqDb = eqMag[x];
        const clamped = Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, eqDb));
        const y = midY - (clamped / EQ_RANGE_DB) * halfH;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = eqOn ? 'rgba(245,236,220,0.88)' : 'rgba(245,236,220,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Frequency labels ─────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,240,220,0.16)';
      ctx.font = `${Math.max(8, Math.floor(8 * (window.devicePixelRatio || 1)))}px var(--font-mono), monospace`;
      ctx.textBaseline = 'bottom';
      [{ f: 100, t: '100' }, { f: 1000, t: '1k' }, { f: 10000, t: '10k' }].forEach(({ f, t: lbl }) => {
        const x = freqToX(f);
        ctx.fillText(lbl, x + 3, ch - 2);
      });

      rafId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      unsubStore();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Top-right floating EQ controls */}
      {trackId && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 z-20">
          <button
            onClick={() => resetTrackEQ(trackId)}
            title="Reset all EQ bands to 0 dB"
            aria-label="Reset EQ"
            className="px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider rounded transition-colors"
            style={{
              background: 'rgba(8,6,4,0.6)',
              color: 'rgba(232,221,208,0.55)',
              border: '1px solid rgba(232,221,208,0.16)',
            }}
          >
            Reset
          </button>
          <button
            onClick={() => toggleTrackEQ(trackId)}
            title={eqEnabled ? 'Bypass EQ' : 'Engage EQ'}
            aria-label="Toggle EQ"
            aria-pressed={eqEnabled}
            className={['btn-3d btn-3d-led', eqEnabled ? 'btn-3d-on' : ''].join(' ')}
            style={{ fontSize: 8, padding: '2px 7px' }}
          >
            EQ
          </button>
        </div>
      )}

      {/* Draggable EQ band nodes */}
      {bands && trackId && cssDims.w > 0 && bands.map((band, i) => (
        <EQNode
          key={i}
          bandIndex={i}
          freq={band.freq}
          gain={band.gain}
          q={band.q}
          containerW={cssDims.w}
          containerH={cssDims.h}
          color={color}
          enabled={eqEnabled}
          trackId={trackId}
          isSelected={selectedBand === i}
          onSelect={() => onSelectBand(i)}
        />
      ))}
    </div>
  );
}
