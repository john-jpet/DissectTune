"use client";

import { useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import MixingDeck from "@/components/MixingDeck";
import type { TrackStatusResponse } from "@/lib/api";

export default function Home() {
  const [tracks, setTracks] = useState<TrackStatusResponse[]>([]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-bold">DissectTune</h1>
        <p className="text-sm text-gray-500">AI-powered multi-track mashup &amp; stem-mixing platform</p>
      </header>

      <UploadPanel onTrackReady={(track) => setTracks((prev) => [...prev, track])} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Mixing Deck</h2>
        <MixingDeck tracks={tracks} />
      </section>
    </main>
  );
}
