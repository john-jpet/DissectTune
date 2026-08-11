const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type TrackStatus = "pending" | "processing" | "completed" | "failed";
export type StemType = "vocals" | "drums" | "bass" | "other";

export interface Stem {
  id: string;
  stem_type: StemType;
  stem_url: string;
}

export interface TrackStatusResponse {
  track_id: string;
  status: TrackStatus;
  bpm: number | null;
  key: string | null;
  original_filename: string;
  error_message: string | null;
  stems: Stem[];
}

export interface TrackUploadResponse {
  track_id: string;
  status: TrackStatus;
}

export async function uploadTrack(file: File): Promise<TrackUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/tracks/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getTrackStatus(trackId: string): Promise<TrackStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/tracks/${trackId}/status`);
  if (!res.ok) {
    throw new Error(`Status fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
