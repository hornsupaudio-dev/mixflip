@AGENTS.md

# MixFlip — Project Briefing

## What it is
MixFlip is a browser-based audio A/B comparison tool for mixing engineers. Drop in multiple mix versions and a reference track, flip between them instantly, and leave timestamped notes. Built by Alek Darson (HornsUP Audio) — he is the product owner and musician, not a developer. Make technical decisions independently and explain the "why" briefly.

## Running the project
```bash
cd C:\Users\Alek\Documents\Claude\Projects\mixflip
npm run dev          # dev server at http://localhost:3000
git push             # triggers Vercel auto-deploy (production)
```
Deployed on Vercel — URL in Vercel dashboard. Also built as a Tauri desktop app (installers in `dist/`, gitignored).

## Stack
- **Next.js 15** (App Router, `'use client'` components throughout)
- **Tailwind CSS v4** — all custom classes in `app/globals.css` inside `@layer components {}`
- **Zustand** — single store at `store/mixflipStore.ts`
- **Web Audio API** — custom engine at `lib/audioEngine.ts`
- **Tauri v2** — desktop wrapper (separate build, not needed for web dev)

## Design system — "Tape Room + HornsUP Red" hardware aesthetic
Film grain overlay + radial vignette on body. Dark warm palette throughout.

### CSS variables
```
--background: #1a1714    (body bg)
--tape-red: #d93a2c      (HornsUP brand red)
--lcd-amber: #e8a04a     (LED/LCD amber)
--surface: #211e1a
--surface-raised: #2e2a25
--border-dark: #0d0b09
--border-light: #3a342e
```

### Key CSS classes (all in globals.css @layer components)
| Class | Purpose |
|---|---|
| `btn-3d` | 3D hardware button base — no LED, no active state |
| `btn-3d-led` | Adds a persistent dim LED dot (use only on panel toggles) |
| `btn-3d-on` | Active/lit state for btn-3d-led buttons |
| `seg-control` | Segmented control wrapper |
| `seg-btn` / `seg-btn-on` | Segment button + active (amber glow) |
| `split-circle` | Half-circle REF/MIX group toggle container |
| `split-circle-btn` / `split-circle-btn-on` | Semicircle button + active state |
| `hw-panel` | Dark hardware panel with border and inset shadow |
| `play-btn` / `play-btn-playing` | 64px circle play button with breathing white glow |
| `tape-tab` / `tape-tab-on` / `tape-tab-off` | Track tab (cassette tape label style) |
| `lcd` | LCD time display (monospace amber) |
| `pipboy-screen` | Dark recessed screen panel (used for LED display) |
| `hw-slider` | Custom range slider styled as hardware fader |

### Fonts loaded (app/layout.tsx)
- `Space_Grotesk` — display/headings (`--font-display`)
- `JetBrains_Mono` — monospace UI (`--font-mono`)
- `VT323`, `Orbitron`, `Press_Start_2P`, `Silkscreen` — available for LED display

### LED display
`components/LEDDisplay.tsx` — canvas dot-matrix scrolling ticker.
- Uses **Press Start 2P** at **3px cells** with red glow
- `fontFamily` prop: `'400 "Press Start 2P", monospace'` (first token = CSS weight)
- `cellSize` prop: default 3
- `color` prop: track color for glow tint
- Restarts scroll on track change via `activeTrackId` prop

## State — mixflipStore.ts
```
tracks[]              — all loaded tracks (mix + reference)
activeTrackId         — currently playing/selected track
activeGroup           — 'mix' | 'reference'
isPlaying
savedMixTime / savedRefTime    — playback position saved per group on switch
lastActiveMixId / lastActiveRefId  — remembers last active track per group
monoEnabled           — mono fold
speakerSim            — 'off' | 'car' | 'room' | 'arena'
simWetDry             — 0–1 wet/dry for speaker sim
volumeMatchEnabled    — LUFS normalization on/off
masterVolume          — 0–1
customIRs[]           — which sims have a custom IR loaded
hoveredNoteId         — waveform marker hover → highlights notes row
pinnedNotesTrackId    — locks notes panel to a specific track
refPulsing            — pulses +Ref button when split circle clicked with no refs
```

Track colors: mixes cycle blue/purple/green/amber/pink. References are always gray `#6b7280`.

## Component map
```
app/page.tsx              — root layout, responsive structure
  Header.tsx              — desktop only — logo + keyboard shortcuts panel
  MobileTrackStrip.tsx    — mobile only — REF/MIX seg + scrollable tabs + drop zone
  VersionTabs.tsx         — tape-style track tabs; scroll prop for mobile horizontal mode
  DropZone.tsx            — "+ Mix" / "+ Ref" drop/click targets
  NowPlayingStrip.tsx     — mobile only — LED marquee with track metadata above waveform
  Waveform.tsx            — waveform display + note markers (drop zone when empty)
  TrackInfo.tsx           — desktop only — file metadata (sample rate, channels, size, etc.)
  PlayerControls.tsx      — play button, scrubber, time display, LED (desktop), REF/MIX toggle (desktop)
  MonitoringBar.tsx       — Vol Match, Mono, speaker sim, vol + wet/dry sliders
  TimestampNotes.tsx      — timestamped notes per track, export to txt/email
  LEDDisplay.tsx          — canvas dot-matrix ticker (PlayerControls desktop + NowPlayingStrip mobile)
  IRLoader.tsx            — HIDDEN — custom IR loading, not in final product
```

## Responsive layout (page.tsx)
Mobile: `h-dvh` full-screen with sticky player at bottom. Desktop: normal scrolling page.
```
<main class="flex flex-col h-dvh sm:h-auto sm:min-h-screen">
  Desktop header            (hidden sm:block)
  Scrollable content area   (flex-1 min-h-0 overflow-y-auto sm:overflow-visible)
    MobileTrackStrip        (sm:hidden)
    Desktop Refs + Mixes    (hidden sm:flex)
    NowPlayingStrip         (sm:hidden)
    Waveform                (both)
    Desktop TrackInfo       (hidden sm:block)
    Desktop Player+Monitoring (hidden sm:flex)
    TimestampNotes          (both)
    Footer                  (hidden sm:block)
  Mobile sticky bottom      (sm:hidden shrink-0)
    PlayerControls noKeyboard  ← keyboard only registered in desktop instance
    MonitoringBar
```

## MonitoringBar — mobile vs desktop
**Mobile:** cycling Flat/Car/Room/Arena button with 4 position dots + chevron to reveal wet/dry. Vol always visible.
**Desktop:** full button row + both sliders side by side.

## Keyboard shortcuts
| Key | Action |
|---|---|
| Space | Play / pause |
| Tab | Cycle to next track in group |
| ← → | Seek ±5 seconds |
| \ | Switch REF ↔ MIX group |
| 1–8 | Jump to track N in active group |

## Audio engine notes
- `audioEngine.switchTo(buffer, gainDb)` — sample-accurate crossfade within same group
- `audioEngine.play(buffer, gainDb, startPos)` — play from position
- `audioEngine.previewSeek(t)` — scrub preview while paused
- `useSyncExternalStore` in PlayerControls for live time (no render loop)
- LUFS normalization computed at decode time (`lib/lufsNorm.ts`)

## Known pending polish
- Play button has a faint dark border ring at peak white glow. `border: 1px solid #0d0b09` contrasts the white bloom. Low priority — looks good in practice.
- TimestampNotes could be a collapsible bottom sheet on mobile (currently in scroll area).
- IRLoader built but hidden — will surface when speaker sim is more polished.

## Git / deploy
- Repo: `https://github.com/hornsupaudio-dev/mixflip.git`
- Branch: `master` → auto-deploys to Vercel on push
- `dist/` gitignored (Tauri installers)
- Always run `npx tsc --noEmit` before committing
