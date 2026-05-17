'use client';

import { create } from 'zustand';
import { audioEngine, SpeakerSim, EQBandParams } from '@/lib/audioEngine';
import { getBuffer, setBuffer, setWaveform, deleteBuffer } from '@/lib/audioStore';
import { extractWaveform } from '@/lib/waveformData';
import { computeGainDb } from '@/lib/lufsNorm';

export type TrackType = 'mix' | 'reference';

export interface TrackEQ {
  enabled: boolean;
  bands: [EQBandParams, EQBandParams, EQBandParams, EQBandParams];
}

export const DEFAULT_EQ: TrackEQ = {
  enabled: false,
  bands: [
    { freq: 100,   gain: 0, q: 0.7071 }, // lo shelf
    { freq: 350,   gain: 0, q: 1.0    }, // lo mid
    { freq: 3500,  gain: 0, q: 1.0    }, // hi mid
    { freq: 10000, gain: 0, q: 0.7071 }, // hi shelf
  ],
};

export interface TimestampNote {
  id: string;
  time: number;
  text: string;
}

export interface Track {
  id: string;
  label: string;
  type: TrackType;
  gainDb: number;
  notes: TimestampNote[];
  color: string;
  isLoading: boolean;
  duration: number;
  fileName: string;
  fileSize: number;
  sampleRate: number;
  numberOfChannels: number;
  eq: TrackEQ;
}

const MIX_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f59e0b', '#ec4899'];
const REF_COLOR = '#6b7280';

interface MixFlipState {
  tracks: Track[];
  activeTrackId: string | null;
  /** Always matches tracks.find(t => t.id === activeTrackId)?.type. Stored to survive track removal. */
  activeGroup: TrackType;
  isPlaying: boolean;
  /** Saved playback position for the mix group — restored when switching back to mixes. */
  savedMixTime: number;
  /** Saved playback position for the reference group. */
  savedRefTime: number;
  colorCursor: number;
  /** Most recently active track in each group — restored on switchGroup(). */
  lastActiveMixId: string | null;
  lastActiveRefId: string | null;
  /** Monitoring controls */
  monoEnabled: boolean;
  speakerSim: SpeakerSim;
  simWetDry: number;
  volumeMatchEnabled: boolean;
  /** Tracks which speaker sims have a custom IR loaded */
  customIRs: string[];
  /** Note marker hovered in the waveform — highlights that row in TimestampNotes */
  hoveredNoteId: string | null;
  /** When set, the notes panel is locked to this track regardless of activeTrackId */
  pinnedNotesTrackId: string | null;
  /** Fires to pulse the +Ref button — triggered by clicking the split circle with no refs loaded */
  refPulsing: boolean;
  /** Fires briefly after each import to draw attention to the VolMatch button */
  volMatchPulsing: boolean;

  addTracks: (files: File[], type?: TrackType) => void;
  removeTrack: (id: string) => void;
  setActiveTrack: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  setTrackType: (id: string, type: TrackType) => void;
  switchGroup: () => void;

  addNote: (trackId: string, text: string, time: number) => void;
  removeNote: (trackId: string, noteId: string) => void;
  updateNote: (trackId: string, noteId: string, text: string) => void;

  setTrackEQ: (trackId: string, bandIndex: number, params: Partial<EQBandParams>) => void;
  toggleTrackEQ: (trackId: string) => void;
  resetTrackEQ: (trackId: string) => void;

  masterVolume: number;
  toggleMono: () => void;
  setSpeakerSim: (sim: SpeakerSim) => void;
  setSimWetDry: (v: number) => void;
  toggleVolumeMatch: () => void;
  setMasterVolume: (v: number) => void;
  addCustomIR: (sim: string) => void;
  setHoveredNoteId: (id: string | null) => void;
  triggerRefPulse: () => void;
  triggerVolMatchPulse: () => void;
  setPinnedNotesTrackId: (id: string | null) => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  cycleTrack: () => void;

  _setPlaying: (v: boolean) => void;
  _setTrackReady: (id: string, duration: number, gainDb: number, sampleRate: number, numberOfChannels: number) => void;
}

export const useMixFlipStore = create<MixFlipState>((set, get) => {
  audioEngine.onEnded = () => get()._setPlaying(false);

  return {
    tracks: [],
    activeTrackId: null,
    activeGroup: 'mix',
    isPlaying: false,
    savedMixTime: 0,
    savedRefTime: 0,
    colorCursor: 0,
    lastActiveMixId: null,
    lastActiveRefId: null,
    monoEnabled: false,
    speakerSim: 'off' as SpeakerSim,
    simWetDry: 1,
    volumeMatchEnabled: false,
    masterVolume: 1,
    customIRs: [],
    hoveredNoteId: null,
    refPulsing: false,
    volMatchPulsing: false,
    pinnedNotesTrackId: null,

    // ── Track management ──────────────────────────────────────────────────────

    addTracks: (files, type = 'mix') => {
      const state = get();
      const newTracks: Track[] = files.map((file) => {
        const color =
          type === 'reference'
            ? REF_COLOR
            : MIX_COLORS[state.colorCursor % MIX_COLORS.length];
        return {
          id: crypto.randomUUID(),
          label: file.name.replace(/\.[^/.]+$/, ''),
          type,
          gainDb: 0,
          notes: [],
          color,
          isLoading: true,
          duration: 0,
          fileName: file.name,
          fileSize: file.size,
          sampleRate: 0,
          numberOfChannels: 0,
          eq: { ...DEFAULT_EQ, bands: DEFAULT_EQ.bands.map((b) => ({ ...b })) as TrackEQ['bands'] },
        };
      });

      set((s) => ({
        tracks: [...s.tracks, ...newTracks],
        activeTrackId: s.activeTrackId ?? newTracks[0]?.id ?? null,
        activeGroup: s.activeTrackId ? s.activeGroup : (newTracks[0] ? type : s.activeGroup),
        colorCursor: type === 'mix' ? s.colorCursor + files.length : s.colorCursor,
      }));

      // Flash the VolMatch button on every import as a hint
      get().triggerVolMatchPulse();

      newTracks.forEach((track, i) => {
        audioEngine.decodeFile(files[i]).then((buffer) => {
          const waveformData = extractWaveform(buffer);
          const gainDb = computeGainDb(buffer);
          setBuffer(track.id, buffer);
          setWaveform(track.id, waveformData);
          get()._setTrackReady(track.id, buffer.duration, gainDb, buffer.sampleRate, buffer.numberOfChannels);
        }).catch((err) => {
          console.error(`Failed to decode "${files[i].name}":`, err);
          set((s) => ({ tracks: s.tracks.filter((t) => t.id !== track.id) }));
        });
      });
    },

    removeTrack: (id) => {
      deleteBuffer(id);
      set((s) => {
        const remaining = s.tracks.filter((t) => t.id !== id);
        const unpinNotes = s.pinnedNotesTrackId === id ? { pinnedNotesTrackId: null } : {};
        if (s.activeTrackId !== id) return { tracks: remaining, ...unpinNotes };

        // Prefer same-group track; fall back to any remaining track
        const sameGroup = remaining.filter((t) => t.type === s.activeGroup);
        const next = sameGroup[0] ?? remaining[0] ?? null;
        return {
          tracks: remaining,
          activeTrackId: next?.id ?? null,
          activeGroup: next?.type ?? s.activeGroup,
          ...unpinNotes,
        };
      });
    },

    setActiveTrack: (id) => {
      const { tracks, activeTrackId, isPlaying, activeGroup, savedMixTime, savedRefTime, volumeMatchEnabled } = get();
      if (id === activeTrackId) return;
      const newTrack = tracks.find((t) => t.id === id);
      if (!newTrack) return;
      const buffer = getBuffer(id);
      if (!buffer) return; // don't mutate activeGroup before buffer is ready

      const switchingGroup = newTrack.type !== activeGroup;
      const lastActiveUpdate = newTrack.type === 'mix'
        ? { lastActiveMixId: id }
        : { lastActiveRefId: id };

      // Apply EQ for the incoming track before any playback change
      audioEngine.setEQ(newTrack.eq.bands, newTrack.eq.enabled);

      if (switchingGroup) {
        const currentPos = audioEngine.getPosition();
        const groupSave =
          activeGroup === 'mix'
            ? { savedMixTime: currentPos }
            : { savedRefTime: currentPos };

        const targetPos = newTrack.type === 'mix' ? savedMixTime : savedRefTime;

        set({ activeTrackId: id, activeGroup: newTrack.type, ...groupSave, ...lastActiveUpdate });

        const effectiveGain = volumeMatchEnabled ? newTrack.gainDb : 0;
        if (isPlaying) {
          audioEngine.play(buffer, effectiveGain, targetPos);
        } else {
          audioEngine.previewSeek(targetPos);
        }
      } else {
        // Same group — sample-accurate crossfade (position stays in sync)
        set({ activeTrackId: id, ...lastActiveUpdate });
        if (isPlaying) {
          const effectiveGain = volumeMatchEnabled ? newTrack.gainDb : 0;
          audioEngine.switchTo(buffer, effectiveGain);
        }
      }
    },

    switchGroup: () => {
      const { tracks, activeGroup, lastActiveMixId, lastActiveRefId } = get();
      const target = activeGroup === 'mix' ? 'reference' : 'mix';
      const remembered = target === 'mix' ? lastActiveMixId : lastActiveRefId;
      const candidate =
        tracks.find((t) => t.id === remembered && getBuffer(t.id)) ??
        tracks.find((t) => t.type === target && getBuffer(t.id));
      if (candidate) get().setActiveTrack(candidate.id);
    },

    updateLabel: (id, label) =>
      set((s) => ({
        tracks: s.tracks.map((t) => (t.id === id ? { ...t, label } : t)),
      })),

    setTrackType: (id, type) =>
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === id
            ? {
                ...t,
                type,
                color: type === 'reference' ? REF_COLOR : MIX_COLORS[s.colorCursor % MIX_COLORS.length],
              }
            : t,
        ),
        colorCursor: type === 'mix' ? s.colorCursor + 1 : s.colorCursor,
        // Keep activeGroup in sync if we're retyping the active track
        activeGroup: id === s.activeTrackId ? type : s.activeGroup,
      })),

    // ── Notes ─────────────────────────────────────────────────────────────────

    addNote: (trackId, text, time) => {
      const note: TimestampNote = { id: crypto.randomUUID(), time, text };
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId
            ? { ...t, notes: [...t.notes, note].sort((a, b) => a.time - b.time) }
            : t,
        ),
      }));
    },

    removeNote: (trackId, noteId) =>
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) } : t,
        ),
      })),

    updateNote: (trackId, noteId, text) =>
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId
            ? { ...t, notes: t.notes.map((n) => (n.id === noteId ? { ...n, text } : n)) }
            : t,
        ),
      })),

    // ── Playback ──────────────────────────────────────────────────────────────

    play: () => {
      const { tracks, activeTrackId, activeGroup, savedMixTime, savedRefTime, volumeMatchEnabled } = get();
      const track = tracks.find((t) => t.id === activeTrackId);
      if (!track) return;
      const buffer = getBuffer(activeTrackId!);
      if (!buffer) return;
      const startPos = activeGroup === 'mix' ? savedMixTime : savedRefTime;
      const effectiveGain = volumeMatchEnabled ? track.gainDb : 0;
      // Order matters: play() builds the audio graph if it doesn't exist yet.
      // Apply EQ AFTER, so the filter nodes definitely exist.
      audioEngine.play(buffer, effectiveGain, startPos);
      audioEngine.setEQ(track.eq.bands, track.eq.enabled);
      set({ isPlaying: true });
    },

    pause: () => {
      const { activeGroup } = get();
      const pos = audioEngine.getPosition();
      audioEngine.pause();
      const timeUpdate = activeGroup === 'mix' ? { savedMixTime: pos } : { savedRefTime: pos };
      set({ isPlaying: false, ...timeUpdate });
    },

    togglePlay: () => {
      const { isPlaying } = get();
      if (isPlaying) get().pause();
      else get().play();
    },

    seek: (time) => {
      const { activeGroup } = get();
      audioEngine.seek(time);
      const timeUpdate = activeGroup === 'mix' ? { savedMixTime: time } : { savedRefTime: time };
      set(timeUpdate);
    },

    toggleMono: () => {
      const next = !get().monoEnabled;
      audioEngine.setMonoFold(next);
      set({ monoEnabled: next });
    },

    setSpeakerSim: (sim) => {
      audioEngine.setSpeakerSim(sim);
      set({ speakerSim: sim });
    },

    setSimWetDry: (v) => {
      set({ simWetDry: v });
      audioEngine.setSimWetDry(v);
    },

    toggleVolumeMatch: () => {
      const next = !get().volumeMatchEnabled;
      set({ volumeMatchEnabled: next });
      const { tracks, activeTrackId } = get();
      const track = tracks.find((t) => t.id === activeTrackId);
      if (track) audioEngine.setActiveGain(next ? track.gainDb : 0);
    },

    setMasterVolume: (v) => {
      set({ masterVolume: v });
      audioEngine.setMasterVolume(v);
    },

    addCustomIR: (sim) =>
      set((s) => ({
        customIRs: s.customIRs.includes(sim) ? s.customIRs : [...s.customIRs, sim],
      })),

    setHoveredNoteId: (id) => set({ hoveredNoteId: id }),
    setPinnedNotesTrackId: (id) => set({ pinnedNotesTrackId: id }),

    setTrackEQ: (trackId, bandIndex, params) => {
      set((s) => ({
        tracks: s.tracks.map((t) => {
          if (t.id !== trackId) return t;
          const newBand = { ...t.eq.bands[bandIndex], ...params };
          // Auto-engage: any band edit that produces a non-zero gain flips
          // the EQ on. Removes the "drag a node, hear nothing, click EQ,
          // drag again" two-step after a fresh start or a RESET.
          const autoEngage = !t.eq.enabled && newBand.gain !== 0;
          return {
            ...t,
            eq: {
              ...t.eq,
              enabled: autoEngage ? true : t.eq.enabled,
              bands: t.eq.bands.map((b, i) =>
                i === bandIndex ? newBand : b,
              ) as TrackEQ['bands'],
            },
          };
        }),
      }));
      const { activeTrackId, tracks } = get();
      if (activeTrackId === trackId) {
        const track = tracks.find((t) => t.id === trackId);
        if (track) audioEngine.setEQ(track.eq.bands, track.eq.enabled);
      }
    },

    toggleTrackEQ: (trackId) => {
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, eq: { ...t.eq, enabled: !t.eq.enabled } } : t,
        ),
      }));
      const { activeTrackId, tracks } = get();
      if (activeTrackId === trackId) {
        const track = tracks.find((t) => t.id === trackId);
        if (track) audioEngine.setEQ(track.eq.bands, track.eq.enabled);
      }
    },

    resetTrackEQ: (trackId) => {
      // Reset bands to defaults but PRESERVE the user's enabled state —
      // hitting RESET while EQ is engaged shouldn't bypass it.
      const freshBands = DEFAULT_EQ.bands.map((b) => ({ ...b })) as TrackEQ['bands'];
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === trackId ? { ...t, eq: { ...t.eq, bands: freshBands } } : t,
        ),
      }));
      const { activeTrackId, tracks } = get();
      if (activeTrackId === trackId) {
        const track = tracks.find((t) => t.id === trackId);
        if (track) audioEngine.setEQ(track.eq.bands, track.eq.enabled);
      }
    },

    triggerRefPulse: () => {
      set({ refPulsing: true });
      // 3 pulses × 1.1 s each + small buffer
      setTimeout(() => set({ refPulsing: false }), 3600);
    },

    triggerVolMatchPulse: () => {
      set({ volMatchPulsing: true });
      setTimeout(() => set({ volMatchPulsing: false }), 2400);
    },

    cycleTrack: () => {
      const { tracks, activeTrackId, activeGroup } = get();
      const group = tracks.filter((t) => t.type === activeGroup && getBuffer(t.id));
      if (group.length < 2) return;
      const idx = group.findIndex((t) => t.id === activeTrackId);
      const next = group[(idx + 1) % group.length];
      get().setActiveTrack(next.id);
    },

    // ── Internal ──────────────────────────────────────────────────────────────

    _setPlaying: (v) => set({ isPlaying: v }),

    _setTrackReady: (id, duration, gainDb, sampleRate, numberOfChannels) =>
      set((s) => ({
        tracks: s.tracks.map((t) =>
          t.id === id ? { ...t, isLoading: false, duration, gainDb, sampleRate, numberOfChannels } : t,
        ),
      })),
  };
});
