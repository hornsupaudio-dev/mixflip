'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore, DEFAULT_EQ } from '@/store/mixflipStore';

// ── Band definitions ──────────────────────────────────────────────────────────
const BANDS = [
  { name: 'LO SHELF', logMin: Math.log10(20),   logMax: Math.log10(800),   haQ: false },
  { name: 'LO MID',   logMin: Math.log10(80),   logMax: Math.log10(3000),  haQ: true  },
  { name: 'HI MID',   logMin: Math.log10(500),  logMax: Math.log10(12000), haQ: true  },
  { name: 'HI SHELF', logMin: Math.log10(1500), logMax: Math.log10(20000), haQ: false },
] as const;

function fmtFreq(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k`;
  return `${Math.round(hz)}`;
}

function fmtGain(db: number): string {
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

export default function EQPanel() {
  const { tracks, activeTrackId, setTrackEQ, toggleTrackEQ, resetTrackEQ } = useMixFlipStore(
    useShallow((s) => ({
      tracks: s.tracks,
      activeTrackId: s.activeTrackId,
      setTrackEQ: s.setTrackEQ,
      toggleTrackEQ: s.toggleTrackEQ,
      resetTrackEQ: s.resetTrackEQ,
    })),
  );

  const track = tracks.find((t) => t.id === activeTrackId);
  if (!track) return null;

  const eq = track.eq;
  const on = eq.enabled;
  const dim = !on;
  const color = track.color;

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[9px] uppercase tracking-widest flex-1 truncate"
          style={{ color: 'rgba(232,221,208,0.3)' }}
        >
          EQ · {track.label}
        </span>
        <button
          onClick={() => resetTrackEQ(track.id)}
          className="btn-3d"
          style={{ fontSize: 8, padding: '2px 7px', opacity: 0.55 }}
          title="Reset all bands to 0"
        >
          RESET
        </button>
        <button
          onClick={() => toggleTrackEQ(track.id)}
          className={['btn-3d btn-3d-led', on ? 'btn-3d-on' : ''].join(' ')}
          style={{ fontSize: 9, padding: '3px 10px' }}
          title={on ? 'Bypass EQ' : 'Enable EQ'}
        >
          {on ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* ── 4 bands ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" style={{ opacity: dim ? 0.38 : 1, transition: 'opacity 150ms' }}>
        {BANDS.map((def, i) => {
          const band = eq.bands[i];
          const gainNonZero = band.gain !== 0;

          return (
            <div key={i} className="flex flex-col gap-0.5">
              {/* Row 1: name | gain slider | gain value */}
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[8px] uppercase tracking-wider shrink-0"
                  style={{ width: 52, color: gainNonZero && on ? color : 'rgba(232,221,208,0.3)' }}
                >
                  {def.name}
                </span>
                <input
                  type="range"
                  min="-12" max="12" step="0.5"
                  value={band.gain}
                  disabled={!on}
                  onChange={(e) => setTrackEQ(track.id, i, { gain: parseFloat(e.target.value) })}
                  className="hw-slider flex-1"
                  style={{ cursor: on ? 'pointer' : 'default' }}
                />
                <span
                  className="font-mono text-[10px] tabular-nums shrink-0 text-right"
                  style={{
                    width: 38,
                    color: gainNonZero && on ? color : 'rgba(232,221,208,0.25)',
                  }}
                >
                  {fmtGain(band.gain)}
                </span>
              </div>

              {/* Row 2: freq slider + value | Q slider + value (mid bands) */}
              <div className="flex items-center gap-2 pl-[52px]">
                <input
                  type="range"
                  min={def.logMin} max={def.logMax} step="0.005"
                  value={Math.log10(band.freq)}
                  disabled={!on}
                  onChange={(e) =>
                    setTrackEQ(track.id, i, { freq: Math.round(Math.pow(10, parseFloat(e.target.value))) })
                  }
                  className="hw-slider"
                  style={{ width: 64, cursor: on ? 'pointer' : 'default' }}
                />
                <span
                  className="font-mono text-[8px] tabular-nums shrink-0"
                  style={{ width: 28, color: 'rgba(232,221,208,0.3)' }}
                >
                  {fmtFreq(band.freq)}
                </span>

                {def.haQ && (
                  <>
                    <input
                      type="range"
                      min="0.3" max="8" step="0.1"
                      value={band.q}
                      disabled={!on}
                      onChange={(e) => setTrackEQ(track.id, i, { q: parseFloat(e.target.value) })}
                      className="hw-slider"
                      style={{ width: 48, cursor: on ? 'pointer' : 'default' }}
                    />
                    <span
                      className="font-mono text-[8px] tabular-nums shrink-0"
                      style={{ width: 24, color: 'rgba(232,221,208,0.25)' }}
                    >
                      Q{band.q.toFixed(1)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
