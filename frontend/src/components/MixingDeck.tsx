"use client";

import type { TrackStatusResponse } from "@/lib/api";
import StemTrack from "./StemTrack";

export default function MixingDeck({ tracks }: { tracks: TrackStatusResponse[] }) {
  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-deck-border bg-deck-panel p-6 text-center text-sm text-gray-500">
        Upload a track to start mixing.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tracks.map((track) => (
        <div key={track.track_id} className="space-y-2">
          <div className="flex items-baseline gap-3">
            <h3 className="font-medium">{track.original_filename}</h3>
            <span className="text-xs text-gray-500">
              {track.bpm} BPM · {track.key}
            </span>
          </div>
          <div className="space-y-2">
            {track.stems.map((stem) => (
              <StemTrack key={stem.id} stem={stem} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
