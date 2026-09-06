export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
export type TrackStatus = "pending" | "processing" | "completed" | "failed";
export type StemType = "vocals" | "drums" | "bass" | "other";
export interface Stem { id: string; stem_type: StemType; stem_url: string }
export interface TrackStatusResponse {
  track_id: string; status: TrackStatus; stage: string; duration: number | null;
  bpm: number | null; key: string | null; original_filename: string;
  error_message: string | null; stems: Stem[];
}
export interface TrackUploadResponse { track_id: string; status: TrackStatus }
export interface StemSettings { active: boolean; solo: boolean; volume: number }
export interface CompositionTrack {
  track_id: string; offset_seconds: number; stems: Record<StemType, StemSettings>;
}
export interface Composition { tracks: CompositionTrack[]; master_volume: number }
export interface Project {
  id: string; title: string; master_bpm: number | null; composition_data: Composition; updated_at: string;
}
export interface AppConfig {
  separation_mode: string; max_upload_mb: number; max_duration_seconds: number; max_project_tracks: number;
}
export function token() { return typeof window === "undefined" ? "" : sessionStorage.getItem("dissecttune-token") || ""; }
export async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token()) headers.set("Authorization", "Bearer " + token());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(API_BASE_URL + path, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === "string" ? data.detail : "Request failed (" + res.status + ")";
    throw new Error(detail);
  }
  return res;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json();
}
export async function uploadTrack(file: File): Promise<TrackUploadResponse> {
  const data = new FormData(); data.append("file", file);
  return api("/api/tracks/upload", { method: "POST", body: data });
}
export function getTrackStatus(id: string): Promise<TrackStatusResponse> {
  return api("/api/tracks/" + id + "/status");
}
