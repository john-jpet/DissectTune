"use client";

import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { Stem } from "@/lib/api";

const STEM_COLORS: Record<string, string> = {
  vocals: "#ff5ca8",
  drums: "#ffb454",
  bass: "#54c7ff",
  other: "#8bff8b",
};

export default function StemTrack({ stem }: { stem: Stem }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState(false);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    let ws: WaveSurfer;
    (async () => {
      const { default: WaveSurferCtor } = await import("wavesurfer.js");
      if (!containerRef.current) return;
      ws = WaveSurferCtor.create({
        container: containerRef.current,
        waveColor: STEM_COLORS[stem.stem_type] ?? "#888",
        progressColor: "#7c5cff",
        height: 64,
        url: stem.stem_url,
        cursorWidth: 1,
      });
      wavesurferRef.current = ws;
    })();

    return () => {
      wavesurferRef.current?.destroy();
    };
  }, [stem.stem_url, stem.stem_type]);

  useEffect(() => {
    wavesurferRef.current?.setVolume(muted ? 0 : volume);
  }, [muted, volume]);

  return (
    <div className="flex items-center gap-3 rounded-md border border-deck-border bg-deck-panel p-3">
      <div className="w-20 shrink-0 text-sm font-medium capitalize" style={{ color: STEM_COLORS[stem.stem_type] }}>
        {stem.stem_type}
      </div>
      <div ref={containerRef} className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setMuted((m) => !m)}
          className={`rounded px-2 py-1 text-xs ${muted ? "bg-red-600" : "bg-deck-border"}`}
        >
          Mute
        </button>
        <button
          onClick={() => setSolo((s) => !s)}
          className={`rounded px-2 py-1 text-xs ${solo ? "bg-deck-accent" : "bg-deck-border"}`}
        >
          Solo
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-24"
        />
      </div>
    </div>
  );
}
