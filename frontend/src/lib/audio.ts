import { Composition, TrackStatusResponse, request } from "./api";

export type Voice = { id: string; buffer: AudioBuffer; offset: number; volume: number };
export function audibleVoices(composition: Composition, tracks: TrackStatusResponse[], buffers: Map<string, AudioBuffer>): Voice[] {
  const hasSolo = composition.tracks.some(t => Object.values(t.stems).some(s => s.solo));
  return composition.tracks.flatMap(t => {
    const track = tracks.find(item => item.track_id === t.track_id);
    return (track?.stems || []).flatMap(stem => {
      const config = t.stems[stem.stem_type], buffer = buffers.get(stem.id);
      return config && buffer ? [{
        id: stem.id, buffer, offset: t.offset_seconds,
        volume: config.active && (!hasSolo || config.solo) ? config.volume : 0,
      }] : [];
    });
  });
}
export function scheduleVoice(ctx: BaseAudioContext, voice: Voice, destination: AudioNode, when: number, position: number) {
  const skip = Math.max(0, position - voice.offset);
  if (skip >= voice.buffer.duration) return null;
  const source = ctx.createBufferSource(), gain = ctx.createGain();
  source.buffer = voice.buffer; gain.gain.value = voice.volume;
  source.connect(gain).connect(destination);
  source.start(when + Math.max(0, voice.offset - position), skip);
  return { source, gain, id: voice.id };
}
export class Mixer {
  context: AudioContext;
  master: GainNode;
  buffers = new Map<string, AudioBuffer>();
  nodes: NonNullable<ReturnType<typeof scheduleVoice>>[] = [];
  startedAt = 0;
  position = 0;
  playing = false;
  generation = 0;
  constructor() {
    this.context = new AudioContext({ sampleRate: 44100 });
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
  }
  async load(tracks: TrackStatusResponse[], signal: AbortSignal, progress: (done: number, total: number) => void) {
    const estimatedBytes = tracks.reduce((total, t) => total + (t.duration || 0) * 44100 * 2 * 4 * t.stems.length, 0);
    if (estimatedBytes > 512 * 1024 * 1024) throw new Error("This mix exceeds the browser's 512 MB audio budget. Use shorter tracks or fewer songs.");
    const stems = tracks.flatMap(t => t.stems);
    const keep = new Set(stems.map(s => s.id));
    for (const id of this.buffers.keys()) if (!keep.has(id)) this.buffers.delete(id);
    let done = 0;
    for (const stem of stems) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (!this.buffers.has(stem.id)) {
        const data = await (await request(stem.stem_url, { signal })).arrayBuffer();
        const buffer = await this.context.decodeAudioData(data);
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        this.buffers.set(stem.id, buffer);
      }
      progress(++done, stems.length);
    }
  }
  currentTime() { return this.playing ? Math.max(0, this.context.currentTime - this.startedAt) : this.position; }
  stop() {
    this.generation++;
    this.position = this.currentTime();
    this.playing = false;
    for (const { source, gain } of this.nodes) { source.stop(); source.disconnect(); gain.disconnect(); }
    this.nodes = [];
  }
  async play(composition: Composition, tracks: TrackStatusResponse[], position = this.position) {
    this.stop();
    const generation = this.generation;
    await this.context.resume();
    if (generation !== this.generation) return;
    this.position = position;
    const when = this.context.currentTime + 0.04;
    this.startedAt = when - position;
    this.master.gain.value = composition.master_volume;
    this.nodes = audibleVoices(composition, tracks, this.buffers)
      .map(v => scheduleVoice(this.context, v, this.master, when, position))
      .filter((n): n is NonNullable<typeof n> => n !== null);
    this.playing = true;
  }
  update(composition: Composition, tracks: TrackStatusResponse[]) {
    this.master.gain.setTargetAtTime(composition.master_volume, this.context.currentTime, 0.01);
    const voices = audibleVoices(composition, tracks, this.buffers);
    for (const node of this.nodes) {
      node.gain.gain.setTargetAtTime(voices.find(v => v.id === node.id)?.volume || 0, this.context.currentTime, 0.01);
    }
  }
  async export(composition: Composition, tracks: TrackStatusResponse[], duration: number) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * 44100), 44100);
    const master = ctx.createGain(); master.gain.value = composition.master_volume;
    master.connect(ctx.destination);
    for (const voice of audibleVoices(composition, tracks, this.buffers)) scheduleVoice(ctx, voice, master, 0, 0);
    return encodeWav(await ctx.startRendering());
  }
  dispose() { this.stop(); this.buffers.clear(); void this.context.close(); }
}
export function encodeWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels, bytes = buffer.length * channels * 2;
  const data = new ArrayBuffer(44 + bytes), view = new DataView(data);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + bytes, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, samples[c][i]));
    view.setInt16(44 + (i * channels + c) * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([data], { type: "audio/wav" });
}
