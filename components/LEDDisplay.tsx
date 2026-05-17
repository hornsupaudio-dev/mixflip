'use client';

import { useEffect, useRef, useCallback } from 'react';

interface LEDDisplayProps {
  label: string;
  color: string;
  isPlaying: boolean;
  activeTrackId: string | null;
  fontFamily?: string;
  cellSize?: number;   // lit square side in CSS px (default 3)
  /** Scroll regardless of isPlaying — useful for empty-state prompts. */
  forceScroll?: boolean;
}

const GAP       = 1;
const SPEED     = 50;
const OFF_SCALE = 3;

export default function LEDDisplay({ label, color, isPlaying, activeTrackId, fontFamily = '400 "Press Start 2P", monospace', cellSize = 3, forceScroll = false }: LEDDisplayProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const offRef     = useRef<HTMLCanvasElement | null>(null);
  const rafRef     = useRef<number>(0);
  const offsetRef  = useRef(0);   // raw float — accumulates freely, never snapped
  const lastTsRef  = useRef<number | null>(null);

  const trackOffsets = useRef(new Map<string, number>());
  const prevTrackRef = useRef<string | null>(null);

  const isPlayingRef   = useRef(isPlaying);
  const forceScrollRef = useRef(forceScroll);
  const colorRef       = useRef(color);
  const cellSizeRef    = useRef(cellSize);
  const displaySizeRef = useRef({ w: 0, h: 0 });
  const offWRef        = useRef(0); // logical CSS-px loop length

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { forceScrollRef.current = forceScroll; }, [forceScroll]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { cellSizeRef.current = cellSize; }, [cellSize]);

  // ── Build off-screen text texture ─────────────────────────────────────────
  // fontFamily format: "WEIGHT FAMILY, fallback" — first token is CSS weight.
  // Padded on the right so the wrap seam reads as one contiguous getImageData.
  const buildOffscreen = useCallback(() => {
    const { w, h } = displaySizeRef.current;
    if (!w || !h) return;

    const fontSize = h * OFF_SCALE * 0.95;
    const text     = label.toUpperCase() + '    '; // 4 spaces — tight gap before loop
    const [weight, ...familyParts] = fontFamily.split(' ');
    const font = `${weight} ${fontSize}px ${familyParts.join(' ')}`;

    const m = document.createElement('canvas').getContext('2d')!;
    m.font = font;
    const textW = Math.ceil(m.measureText(text).width);
    if (textW === 0) return;

    if (!offRef.current) offRef.current = document.createElement('canvas');
    const off    = offRef.current;
    const padOff = Math.ceil(w * OFF_SCALE) + OFF_SCALE * 4;
    off.width    = textW + padOff;
    off.height   = Math.ceil(fontSize);
    offWRef.current = textW / OFF_SCALE; // logical loop length in CSS px

    const ctx    = off.getContext('2d')!;
    ctx.clearRect(0, 0, off.width, off.height);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = font;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 0, 0);
    // Copy leading slice into pad so reads across the seam see the next loop naturally
    ctx.drawImage(off, 0, 0, padOff, off.height, textW, 0, padOff, off.height);
  }, [label, fontFamily]);

  // ── Render one frame ──────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const off    = offRef.current;
    if (!canvas || !off || off.width === 0) return;

    const { w, h } = displaySizeRef.current;
    if (!w || !h) return;

    const dpr   = window.devicePixelRatio || 1;
    const needW = Math.round(w * dpr);
    const needH = Math.round(h * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width  = needW;
      canvas.height = needH;
    }

    const offW = offWRef.current;
    const CELL = cellSizeRef.current;
    const STEP = CELL + GAP;

    // Snap display position to whole LED-cell boundaries (multiples of STEP).
    // Each hop shifts every LED to its neighbour's previous value — no LED ever
    // changes its sample phase mid-character, so letter shapes are rock-solid.
    // The raw float in offsetRef accumulates freely; snapping is display-only.
    const scrollX     = ((offsetRef.current % offW) + offW) % offW;
    const scrollXSnap = Math.round(scrollX / STEP) * STEP % offW;
    const scrollXOff  = Math.round(scrollXSnap * OFF_SCALE);

    const winWOff = Math.ceil(w * OFF_SCALE);
    const winHOff = off.height;
    if (winWOff <= 0 || winHOff <= 0 || scrollXOff + winWOff > off.width) return;

    // One getImageData from the high-res off-screen — no downsample intermediary
    const sc      = off.getContext('2d')!;
    const srcData = sc.getImageData(scrollXOff, 0, winWOff, winHOff).data;

    // ── Paint LED grid ────────────────────────────────────────────────────
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const c = colorRef.current;
    let r = 100, g = 220, b = 100;
    if (c.startsWith('#') && c.length >= 7) {
      r = parseInt(c.slice(1, 3), 16);
      g = parseInt(c.slice(3, 5), 16);
      b = parseInt(c.slice(5, 7), 16);
    }

    const cols      = Math.floor(w / STEP);
    const rows      = Math.floor(h / STEP);
    const yOff      = Math.floor((h - rows * STEP) / 2) + 1;
    const yScale    = winHOff / h;
    const blockSide = CELL * OFF_SCALE;

    // Glow — applied once; scales naturally with fill opacity so dim cells barely bleed
    ctx.shadowBlur  = CELL * 2.5;
    ctx.shadowColor = `rgba(${r},${g},${b},0.75)`;

    for (let row = 0; row < rows; row++) {
      const cellY = yOff + row * STEP;
      const oy0   = Math.max(0, Math.floor(cellY * yScale));
      const oy1   = Math.min(winHOff, oy0 + blockSide);

      for (let col = 0; col < cols; col++) {
        const cellX = col * STEP;
        const ox0   = cellX * OFF_SCALE;
        const ox1   = Math.min(winWOff, ox0 + blockSide);

        // Box-filter average over the 9×9 source block.
        // Because scrollXOff is snapped to texel boundaries this value is
        // bit-identical for the same scroll position every frame.
        let sum = 0, cnt = 0;
        for (let py = oy0; py < oy1; py++) {
          const rowBase = py * winWOff;
          for (let px = ox0; px < ox1; px++) {
            sum += srcData[(rowBase + px) * 4 + 3];
            cnt++;
          }
        }
        const a = cnt ? sum / (cnt * 255) : 0;

        // Hard threshold — stable because phase never drifts
        const opacity = a > 0.40 ? Math.min(1, 0.55 + a * 0.45) : 0.055;
        ctx.fillStyle = `rgba(${r},${g},${b},${opacity.toFixed(2)})`;
        ctx.fillRect(cellX, cellY, CELL, CELL);
      }
    }

    ctx.shadowBlur = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, []);

  // ── Animation loop — raw float accumulation, snap happens in drawFrame ────
  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current !== null && (isPlayingRef.current || forceScrollRef.current)) {
        offsetRef.current += (ts - lastTsRef.current) / 1000 * SPEED;
      }
      lastTsRef.current = ts;
      drawFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      displaySizeRef.current = { w: Math.round(width), h: Math.round(height) };
      buildOffscreen();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [buildOffscreen]);

  // ── Rebuild when label or font changes ────────────────────────────────────
  useEffect(() => {
    document.fonts.ready.then(() => buildOffscreen());
  }, [label, fontFamily, buildOffscreen]);

  // ── Track switch: save / restore raw offset ───────────────────────────────
  useEffect(() => {
    if (prevTrackRef.current !== null) {
      trackOffsets.current.set(prevTrackRef.current, offsetRef.current);
    }
    offsetRef.current = trackOffsets.current.get(activeTrackId ?? '') ?? 0;
    prevTrackRef.current = activeTrackId;
  }, [activeTrackId]);

  const isDefaultColor = !color || color.startsWith('rgba');

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        filter: isDefaultColor ? 'none' : `drop-shadow(0 0 4px ${color}88)`,
      }}
    />
  );
}
