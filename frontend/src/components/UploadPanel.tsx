"use client";

import { useRef, useState } from "react";
import { uploadTrack, getTrackStatus, type TrackStatusResponse } from "@/lib/api";

const POLL_INTERVAL_MS = 2000;

export default function UploadPanel({ onTrackReady }: { onTrackReady: (track: TrackStatusResponse) => void }) {
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileSelected(file: File) {
    setUploading(true);
    setStatusText("Uploading...");
    try {
      const { track_id } = await uploadTrack(file);
      setStatusText("Processing (stem separation + BPM/key detection)...");
      pollStatus(track_id);
    } catch (err) {
      setStatusText(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  function pollStatus(trackId: string) {
    const interval = setInterval(async () => {
      try {
        const track = await getTrackStatus(trackId);
        if (track.status === "completed") {
          clearInterval(interval);
          setStatusText(`Ready — ${track.bpm} BPM, key ${track.key}`);
          setUploading(false);
          onTrackReady(track);
        } else if (track.status === "failed") {
          clearInterval(interval);
          setStatusText(`Failed: ${track.error_message}`);
          setUploading(false);
        } else {
          setStatusText(`Status: ${track.status}...`);
        }
      } catch (err) {
        clearInterval(interval);
        setStatusText(err instanceof Error ? err.message : "Status check failed");
        setUploading(false);
      }
    }, POLL_INTERVAL_MS);
  }

  return (
    <div className="rounded-lg border border-deck-border bg-deck-panel p-6">
      <h2 className="mb-3 text-lg font-semibold">Upload a track</h2>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.flac"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
        }}
        className="block w-full text-sm text-gray-300 file:mr-4 file:rounded file:border-0 file:bg-deck-accent file:px-4 file:py-2 file:text-white"
      />
      {statusText && <p className="mt-3 text-sm text-gray-400">{statusText}</p>}
    </div>
  );
}
