'use client';

// Temporary dev tool — remove before ship

import { useEffect } from 'react';

// Format: "WEIGHT FAMILY, fallback" — first token is CSS font-weight.
// url: Google Fonts CSS URL to lazy-load the font (omit if already in layout.tsx)
const FONTS: { label: string; value: string; url?: string }[] = [
  // ── Already loaded via next/font ──────────────────────────────────────────
  { label: 'Silkscreen 700',      value: '700 Silkscreen, monospace' },
  { label: 'Press Start 2P',      value: '400 "Press Start 2P", monospace' },
  { label: 'System Fixed Bold',   value: '700 ui-monospace, monospace' },
  { label: 'Courier Bold',        value: '700 "Courier New", monospace' },
  { label: 'JetBrains Mono 600',  value: '600 "JetBrains Mono", monospace' },
  { label: 'Orbitron 900',        value: '900 Orbitron, monospace' },
  { label: 'VT323',               value: '400 VT323, monospace' },

  // ── Pixel / retro ─────────────────────────────────────────────────────────
  { label: 'Pixelify Sans 700',   value: '700 "Pixelify Sans", monospace',  url: 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@700&display=swap' },
  { label: 'DotGothic16',         value: '400 DotGothic16, monospace',      url: 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap' },

  // ── Sci-fi / technical ────────────────────────────────────────────────────
  { label: 'Share Tech Mono',     value: '400 "Share Tech Mono", monospace', url: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap' },
  { label: 'Chakra Petch 700',    value: '700 "Chakra Petch", monospace',    url: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@700&display=swap' },
  { label: 'Oxanium 800',         value: '800 Oxanium, monospace',           url: 'https://fonts.googleapis.com/css2?family=Oxanium:wght@800&display=swap' },
  { label: 'Audiowide',           value: '400 Audiowide, monospace',         url: 'https://fonts.googleapis.com/css2?family=Audiowide&display=swap' },
  { label: 'Michroma',            value: '400 Michroma, monospace',          url: 'https://fonts.googleapis.com/css2?family=Michroma&display=swap' },
  { label: 'Aldrich',             value: '400 Aldrich, monospace',           url: 'https://fonts.googleapis.com/css2?family=Aldrich&display=swap' },
  { label: 'Quantico 700',        value: '700 Quantico, monospace',          url: 'https://fonts.googleapis.com/css2?family=Quantico:wght@700&display=swap' },
  { label: 'Jura 700',            value: '700 Jura, monospace',              url: 'https://fonts.googleapis.com/css2?family=Jura:wght@700&display=swap' },
  { label: 'Exo 2 900',           value: '900 "Exo 2", monospace',           url: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@900&display=swap' },
  { label: 'Rajdhani 700',        value: '700 Rajdhani, monospace',          url: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap' },
  { label: 'Syncopate 700',       value: '700 Syncopate, monospace',         url: 'https://fonts.googleapis.com/css2?family=Syncopate:wght@700&display=swap' },
  { label: 'Nova Mono',           value: '400 "Nova Mono", monospace',       url: 'https://fonts.googleapis.com/css2?family=Nova+Mono&display=swap' },
  { label: 'Sarpanch 900',        value: '900 Sarpanch, monospace',          url: 'https://fonts.googleapis.com/css2?family=Sarpanch:wght@900&display=swap' },

  // ── Bold display / condensed ──────────────────────────────────────────────
  { label: 'Russo One',           value: '400 "Russo One", monospace',       url: 'https://fonts.googleapis.com/css2?family=Russo+One&display=swap' },
  { label: 'Teko 700',            value: '700 Teko, monospace',              url: 'https://fonts.googleapis.com/css2?family=Teko:wght@700&display=swap' },
  { label: 'Squada One',          value: '400 "Squada One", monospace',      url: 'https://fonts.googleapis.com/css2?family=Squada+One&display=swap' },
  { label: 'Black Ops One',       value: '400 "Black Ops One", monospace',   url: 'https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap' },
  { label: 'Bungee',              value: '400 Bungee, monospace',            url: 'https://fonts.googleapis.com/css2?family=Bungee&display=swap' },
  { label: 'Bebas Neue',          value: '400 "Bebas Neue", monospace',      url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  { label: 'Oswald 700',          value: '700 Oswald, monospace',            url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@700&display=swap' },
  { label: 'Antonio 700',         value: '700 Antonio, monospace',           url: 'https://fonts.googleapis.com/css2?family=Antonio:wght@700&display=swap' },

  // ── Clean monospace ───────────────────────────────────────────────────────
  { label: 'IBM Plex Mono 700',   value: '700 "IBM Plex Mono", monospace',   url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@700&display=swap' },
  { label: 'Fira Mono 700',       value: '700 "Fira Mono", monospace',       url: 'https://fonts.googleapis.com/css2?family=Fira+Mono:wght@700&display=swap' },
  { label: 'Source Code Pro 900', value: '900 "Source Code Pro", monospace', url: 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@900&display=swap' },
  { label: 'Roboto Mono 700',     value: '700 "Roboto Mono", monospace',     url: 'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@700&display=swap' },
  { label: 'Space Mono 700',      value: '700 "Space Mono", monospace',      url: 'https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,700&display=swap' },
  { label: 'Inconsolata 900',     value: '900 Inconsolata, monospace',       url: 'https://fonts.googleapis.com/css2?family=Inconsolata:wght@900&display=swap' },
  { label: 'Courier Prime 700',   value: '700 "Courier Prime", monospace',   url: 'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&display=swap' },
  { label: 'Share Tech',          value: '400 "Share Tech", monospace',      url: 'https://fonts.googleapis.com/css2?family=Share+Tech&display=swap' },
];

const CELL_SIZES = [
  { label: '1px', value: 1 },
  { label: '2px', value: 2 },
  { label: '3px', value: 3 },
  { label: '4px', value: 4 },
  { label: '5px', value: 5 },
];

interface Props {
  value: string;
  onFontChange: (font: string) => void;
  cellSize: number;
  onCellChange: (size: number) => void;
}

export default function LEDFontChooser({ value, onFontChange, cellSize, onCellChange }: Props) {
  useEffect(() => {
    FONTS.forEach(({ url }) => {
      if (!url) return;
      if (document.querySelector(`link[href="${url}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        bottom: 16,
        zIndex: 9999,
        background: '#0e0e0e',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        padding: '10px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        fontFamily: 'monospace',
        color: '#aaa',
        boxShadow: '0 4px 24px rgba(0,0,0,0.9)',
        minWidth: 190,
        overflowY: 'auto',
      }}
    >
      <div style={{ color: '#444', marginBottom: 4, fontSize: 10, letterSpacing: '0.12em', paddingLeft: 6 }}>
        CELL SIZE
      </div>
      <div style={{ display: 'flex', gap: 4, paddingLeft: 6, marginBottom: 8 }}>
        {CELL_SIZES.map((s) => {
          const active = cellSize === s.value;
          return (
            <button
              key={s.value}
              onClick={() => onCellChange(s.value)}
              style={{
                background: active ? '#1a3a1a' : 'transparent',
                border: active ? '1px solid #2a5a2a' : '1px solid #2a2a2a',
                borderRadius: 3,
                color: active ? '#6f6' : '#555',
                fontFamily: 'monospace',
                fontSize: 11,
                padding: '3px 6px',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ color: '#444', marginBottom: 4, fontSize: 10, letterSpacing: '0.12em', paddingLeft: 6 }}>
        FONT
      </div>
      {FONTS.map((f) => {
        const active = value === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onFontChange(f.value)}
            style={{
              background: active ? '#1a3a1a' : 'transparent',
              border: 'none',
              borderRadius: 3,
              color: active ? '#6f6' : '#666',
              fontFamily: 'monospace',
              fontSize: 11,
              padding: '4px 8px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: active ? 'inset 0 0 0 1px #2a5a2a' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {active ? '▶ ' : '  '}{f.label}
          </button>
        );
      })}
    </div>
  );
}
