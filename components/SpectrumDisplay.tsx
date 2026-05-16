'use client';

import { useEffect, useRef } from 'react';
import { useMixFlipStore } from '@/store/mixflipStore';
import { audioEngine } from '@/lib/audioEngine';

// Spectrum dB scale (vertical axis for the audio spectrum fill)
const SPEC_MIN_DB = -75;

// EQ curve scale — ±EQ_RANGE_DB maps to the full canvas height around the
// midline. Generous so worst-case combined boost still fits visually.
const EQ_RANGE_DB = 15;

// Log-freq display range
const F_MIN = 20;
const F_MAX = 20000;

export default function SpectrumDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let freqs: Float32Array<ArrayBuffer> | null = null;
    let eqMag: Float32Array<ArrayBuffer> | null = null;
    let cw = 0, ch = 0;

    const logMin = Math.log10(F_MIN);
    const logMax = Math.log10(F_MAX);

    const recomputeEQ = () => {
      const state = useMixFlipStore.getState();
      const t = state.tracks.find((x) => x.id === state.activeTrackId);
      if (!t || !freqs || !eqMag) {
        if (eqMag) eqMag.fill(0); // flat curve when no track
        return;
      }
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

      // Per-column log-frequency lookup
      freqs = new Float32Array(w);
      eqMag = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        freqs[x] = Math.pow(10, logMin + (x / Math.max(1, w - 1)) * (logMax - logMin));
      }
      recomputeEQ();
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    // Recompute the EQ curve whenever any active-track EQ param changes
    const unsubStore = useMixFlipStore.subscribe((state, prev) => {
      const t  = state.tracks.find((x) => x.id === state.activeTrackId);
      const pt = prev.tracks.find((x) => x.id === prev.activeTrackId);
      if (t?.eq.bands !== pt?.eq.bands || t?.id !== pt?.id) {
        recomputeEQ();
      }
    });

    const freqToX = (f: number) => ((Math.log10(f) - logMin) / (logMax - logMin)) * cw;

    const draw = () => {
      if (cw === 0 || ch === 0 || !freqs || !eqMag) {
        rafId = requestAnimationFrame(draw);
        return;
      }

      const state = useMixFlipStore.getState();
      const t = state.tracks.find((x) => x.id === state.activeTrackId);
      const color = t?.color ?? '#6b7280';
      const eqEnabled = !!t?.eq.enabled;

      ctx.clearRect(0, 0, cw, ch);

      // ── Reference grid ─────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,240,220,0.04)';
      ctx.lineWidth = 1;
      // EQ midline (0 dB)
      ctx.beginPath();
      ctx.moveTo(0, ch / 2);
      ctx.lineTo(cw, ch / 2);
      ctx.stroke();
      // Vertical: 100, 1k, 10k
      [100, 1000, 10000].forEach((f) => {
        const x = freqToX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ch);
        ctx.stroke();
      });

      // ── Spectrum ───────────────────────────────────────────────────────
      const bins = audioEngine.getSpectrumBins();
      if (bins) {
        const binCount = bins.length;
        const nyquist = audioEngine.sampleRate / 2;
        const dbToY = (db: number) => {
          if (db <= SPEC_MIN_DB) return ch;
          if (db >= 0) return 0;
          return ch - ((db - SPEC_MIN_DB) / -SPEC_MIN_DB) * ch;
        };

        // Filled area
        ctx.beginPath();
        for (let x = 0; x < cw; x++) {
          const freq = freqs[x];
          const binF = (freq / nyquist) * binCount;
          const bin = Math.min(binCount - 1, Math.floor(binF));
          const y = dbToY(bins[bin]);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(cw, ch);
        ctx.lineTo(0, ch);
        ctx.closePath();
        ctx.fillStyle = `${color}28`;
        ctx.fill();

        // Stroke on top
        ctx.beginPath();
        for (let x = 0; x < cw; x++) {
          const freq = freqs[x];
          const binF = (freq / nyquist) * binCount;
          const bin = Math.min(binCount - 1, Math.floor(binF));
          const y = dbToY(bins[bin]);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // ── EQ curve overlay ───────────────────────────────────────────────
      const midY = ch / 2;
      const halfH = ch / 2;
      ctx.beginPath();
      for (let x = 0; x < cw; x++) {
        const eqDb = eqMag[x];
        // Clamp to ±EQ_RANGE_DB visually
        const clamped = Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, eqDb));
        const y = midY - (clamped / EQ_RANGE_DB) * halfH;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = eqEnabled ? 'rgba(255,240,220,0.82)' : 'rgba(255,240,220,0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // ── Subtle frequency labels (100 / 1k / 10k) ───────────────────────
      ctx.fillStyle = 'rgba(255,240,220,0.16)';
      ctx.font = `${Math.max(8, Math.floor(8 * (window.devicePixelRatio || 1)))}px var(--font-mono), monospace`;
      ctx.textBaseline = 'bottom';
      [
        { f: 100,   t: '100' },
        { f: 1000,  t: '1k'  },
        { f: 10000, t: '10k' },
      ].forEach(({ f, t: label }) => {
        const x = freqToX(f);
        ctx.fillText(label, x + 3, ch - 2);
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

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}
