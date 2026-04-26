'use client';

import { useShallow } from 'zustand/react/shallow';
import { useMixFlipStore } from '@/store/mixflipStore';

const COMPRESSED = new Set(['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'mp4']);

function fmtSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtChannels(n: number): string {
  if (n === 1) return 'Mono';
  if (n === 2) return 'Stereo';
  return `${n}ch`;
}

export default function TrackInfo() {
  const activeTrack = useMixFlipStore(useShallow((s) =>
    s.tracks.find((t) => t.id === s.activeTrackId) ?? null,
  ));

  if (!activeTrack || activeTrack.isLoading || activeTrack.sampleRate === 0) return null;

  const ext = activeTrack.fileName.split('.').pop()?.toLowerCase() ?? '';
  const isCompressed = COMPRESSED.has(ext);

  const formatInfo = isCompressed
    ? `${Math.round((activeTrack.fileSize * 8) / (activeTrack.duration * 1000))} kbps`
    : `${activeTrack.sampleRate % 1000 === 0 ? activeTrack.sampleRate / 1000 : (activeTrack.sampleRate / 1000).toFixed(1)} kHz`;

  const items = [
    ext.toUpperCase(),
    formatInfo,
    fmtChannels(activeTrack.numberOfChannels),
    fmtSize(activeTrack.fileSize),
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3">
      {items.map((item, i) => (
        <span key={i} className="text-[11px] font-mono text-white/25">
          {item}
        </span>
      ))}
    </div>
  );
}
