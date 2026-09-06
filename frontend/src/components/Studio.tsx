"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, AppConfig, Composition, Project, StemSettings, StemType, TrackStatusResponse, uploadTrack } from "@/lib/api";
import { Mixer } from "@/lib/audio";
import WaveLane from "./WaveLane";

const colors: Record<StemType, string> = { vocals: "#c5a5ff", drums: "#f9bc79", bass: "#72d3d3", other: "#b4d891" };
const clock = (n: number) => Math.floor(n / 60).toString().padStart(2, "0") + ":" + Math.floor(n % 60).toString().padStart(2, "0");
const message = (e: unknown) => e instanceof Error ? e.message : "Something went wrong. Please try again.";
const snapshot = (p: Project) => JSON.stringify({ title: p.title, master_bpm: p.master_bpm, composition_data: p.composition_data });

export default function Studio() {
  const [email, setEmail] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authBusy, setAuthBusy] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tracks, setTracks] = useState<TrackStatusResponse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("Saved");
  const saved = useRef("");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [uploading, setUploading] = useState("");
  const [dragging, setDragging] = useState(false);
  const [audioState, setAudioState] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const mixer = useRef<Mixer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = project?.composition_data.tracks || [];
  const selectedIds = selected.map(t => t.track_id).join(",");
  const activeTracks = selected.flatMap(t => tracks.find(item => item.track_id === t.track_id) || []);
  const duration = Math.max(0, ...selected.map(t => t.offset_seconds + (tracks.find(item => item.track_id === t.track_id)?.duration || 0)));
  const stop = useCallback(() => { mixer.current?.stop(); setPlaying(false); }, []);
  const edit = (change: (p: Project) => Project) => {
    if (!projectRef.current) return;
    const next = change(projectRef.current);
    projectRef.current = next; setProject(next); setSaveState("Unsaved");
  };
  const persist = useCallback(async (p: Project) => {
    const body = snapshot(p);
    if (body === saved.current && projectRef.current?.id === p.id) return;
    setSaveState("Saving…");
    const operation = saveQueue.current.catch(() => {}).then(() =>
      api<Project>("/api/projects/" + p.id, { method: "PUT", body }));
    saveQueue.current = operation;
    try {
      const result = await operation;
      setProjects(old => [result, ...old.filter(item => item.id !== p.id)]);
      if (projectRef.current?.id === p.id && snapshot(projectRef.current) === body) {
        saved.current = body; setSaveState("Saved");
      }
    } catch (e) { setSaveState("Save failed"); throw e; }
  }, []);
  const openProject = async (next: Project) => {
    try {
      if (projectRef.current) await persist(projectRef.current);
      stop(); setPosition(0);
      // Normalize legacy project fields into the current MVP composition schema.
      const normalized: Project = { ...next, composition_data: {
        master_volume: next.composition_data.master_volume ?? 0.8,
        tracks: next.composition_data.tracks.map(t => ({ track_id: t.track_id, offset_seconds: t.offset_seconds,
          stems: Object.fromEntries(Object.entries(t.stems).map(([key, value]) => [key,
            { active: value.active, solo: value.solo ?? false, volume: value.volume }])) as Record<StemType, StemSettings> })),
      }};
      projectRef.current = normalized; setProject(normalized); saved.current = snapshot(normalized); setSaveState("Saved");
    } catch (e) { setError(message(e)); }
  };
  useEffect(() => {
    void api<AppConfig>("/api/config").then(setConfig).catch(e => setError(message(e)));
    if (sessionStorage.getItem("dissecttune-token")) {
      void api<{ email: string }>("/api/auth/me").then(u => setEmail(u.email)).catch(() => sessionStorage.removeItem("dissecttune-token"));
    }
  }, []);
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const list = await api<TrackStatusResponse[]>("/api/tracks");
        if (!cancelled) setTracks(list);
      } catch (e) { if (!cancelled) setError(message(e)); }
      if (!cancelled) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    void api<Project[]>("/api/projects").then(list => { if (!cancelled) setProjects(list); }).catch(e => setError(message(e)));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [email]);
  useEffect(() => {
    if (!project || snapshot(project) === saved.current) return;
    const timer = setTimeout(() => { void persist(project).catch(e => setError(message(e))); }, 900);
    return () => clearTimeout(timer);
  }, [project, persist]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (projectRef.current && snapshot(projectRef.current) !== saved.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const stemSignature = activeTracks.flatMap(t => t.stems.map(s => s.id)).join(",");
  useEffect(() => {
    if (!selectedIds || !stemSignature) { setAudioReady(false); return; }
    const controller = new AbortController();
    if (!mixer.current) mixer.current = new Mixer();
    stop(); setAudioReady(false); setAudioState("Loading audio…");
    const available = tracks.filter(t => selectedIds.split(",").includes(t.track_id));
    void mixer.current.load(available, controller.signal, (done, total) => setAudioState("Loading stems " + done + " / " + total))
      .then(() => { if (!controller.signal.aborted) { setAudioReady(true); setAudioState(""); } })
      .catch(e => { if (!controller.signal.aborted) { setAudioState("Audio unavailable"); setError(message(e)); } });
    return () => controller.abort();
    // Only reload when project membership or stem IDs change, not on polling updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, stemSignature, loadRevision, stop]);
  useEffect(() => { if (project) mixer.current?.update(project.composition_data, tracks); }, [project, tracks]);
  useEffect(() => () => mixer.current?.dispose(), []);
  const play = useCallback(async () => {
    if (!project || !mixer.current || !audioReady) return;
    try {
      if (mixer.current.playing) { setPosition(mixer.current.currentTime()); stop(); }
      else { await mixer.current.play(project.composition_data, tracks, position >= duration ? 0 : position); setPlaying(true); }
    } catch (e) { setError(message(e)); }
  }, [project, tracks, position, duration, audioReady, stop]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space" && !["INPUT", "BUTTON", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault(); void play();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [play]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const now = mixer.current?.currentTime() || 0;
      if (now >= duration) { stop(); setPosition(duration); return; }
      setPosition(now); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, stop]);
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api<{ token: string; email: string }>("/api/auth/" + authMode, {
        method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      sessionStorage.setItem("dissecttune-token", result.token); setEmail(result.email);
    } catch (e) { setError(message(e)); } finally { setAuthBusy(false); }
  }
  async function upload(files: FileList | File[]) {
    if (uploading) return;
    for (const file of Array.from(files)) {
      setUploading(file.name); setError("");
      try {
        if (config && file.size > config.max_upload_mb * 1024 * 1024) throw new Error(file.name + ": exceeds upload limit");
        await uploadTrack(file);
      } catch (e) { setError(message(e)); }
    }
    setUploading("");
    try { setTracks(await api<TrackStatusResponse[]>("/api/tracks")); } catch (e) { setError(message(e)); }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function createProject() {
    try {
      if (projectRef.current) await persist(projectRef.current);
      const next = await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ title: "Untitled session", track_ids: [] }) });
      setProjects(old => [next, ...old]); await openProject(next);
    } catch (e) { setError(message(e)); }
  }
  function addTrack(track: TrackStatusResponse) {
    if (!project || selected.length >= (config?.max_project_tracks || 4)) return;
    stop();
    edit(p => ({ ...p, composition_data: { ...p.composition_data, tracks: [...p.composition_data.tracks, {
      track_id: track.track_id, offset_seconds: 0,
      stems: Object.fromEntries(track.stems.map(s => [s.stem_type, { active: true, solo: false, volume: 0.7 }])) as Record<StemType, StemSettings>,
    }] } }));
  }
  function stemEdit(id: string, type: StemType, values: Partial<StemSettings>) {
    edit(p => ({ ...p, composition_data: { ...p.composition_data, tracks: p.composition_data.tracks.map(t =>
      t.track_id === id ? { ...t, stems: { ...t.stems, [type]: { ...t.stems[type], ...values } } } : t) } }));
  }
  async function seek(next: number) {
    setPosition(next);
    if (playing && mixer.current && project) await mixer.current.play(project.composition_data, tracks, next);
    else if (mixer.current) mixer.current.position = next;
  }
  async function exportMix() {
    if (!project || !mixer.current || !audioReady || !duration) return;
    setExporting(true); stop();
    try {
      await persist(project);
      const blob = await mixer.current.export(project.composition_data, tracks, duration);
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = (project.title.replace(/[^a-z0-9 _-]/gi, "") || "mix") + ".wav";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setError(message(e)); } finally { setExporting(false); }
  }
  if (!email) return <main className="welcome">
    <div className="welcome-art"><div className="brand"><span className="brand-icon">∿</span> DissectTune <small>STUDIO</small></div>
      <div className="welcome-copy"><p className="eyebrow">A NEW WAY TO HEAR IT</p><h1>Take it apart.<br /><em>Make it yours.</em></h1>
      <p>Find the vocals. Feel the rhythm. Bring your favourite sounds together in a mix only you could make.</p>
      <div className="art-lanes" aria-hidden="true">{Object.entries(colors).map(([name, color], row) => <div key={name} style={{ color }}><span>{name}</span><div>{Array.from({ length: 50 }, (_, i) => <i key={i} style={{ height: (12 + Math.abs(Math.sin(i * 1.7 + row * 3) * Math.cos(i * .23)) * 55) + "px" }} />)}</div></div>)}</div>
      <p className="welcome-foot">FOUR STEMS. ENDLESS POSSIBILITIES.</p></div>
    </div><section className="auth-panel"><p className="eyebrow">YOUR NEXT MIX STARTS HERE</p><h2>{authMode === "register" ? "Create your studio." : "Welcome back."}</h2>
      <p className="muted">A little separation. A lot of possibility.</p>
      <form onSubmit={authenticate}><label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
      <label>Password<input name="password" type="password" minLength={10} maxLength={128} autoComplete={authMode === "register" ? "new-password" : "current-password"} required placeholder="At least 10 characters" /></label>
      <button className="primary" disabled={authBusy}>{authBusy ? "Opening your studio…" : authMode === "register" ? "Create account →" : "Sign in →"}</button></form>
      {error && <p role="alert" className="error-inline">{error}</p>}
      <button className="text-button" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setError(""); }}>
        {authMode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}</button>
      <p className="auth-note">Your projects and audio belong to your account.</p>
    </section></main>;

  return <div className="studio">
    <header className="topbar"><div className="brand"><span className="brand-icon">∿</span> DissectTune <small>STUDIO</small></div>
      <div className="account"><span>{email}</span><button className="text-button" onClick={async () => {
        try { if (projectRef.current) await persist(projectRef.current); stop(); sessionStorage.removeItem("dissecttune-token");
          mixer.current?.dispose(); mixer.current = null; setEmail(null); setProject(null); projectRef.current = null; setTracks([]); setProjects([]);
        } catch (e) { setError(message(e)); }
      }}>Sign out</button></div></header>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    <div className="workspace">
      <aside className="sidebar"><div className="section-heading"><h2>Your sessions</h2><button title="New session" aria-label="New session" onClick={createProject}>＋</button></div>
        <nav aria-label="Projects" className="project-list">{projects.map(p => <button key={p.id} className={p.id === project?.id ? "selected" : ""} onClick={() => openProject(p)}><span>◫</span><span>{p.title}</span></button>)}
        {!projects.length && <p className="muted small">Create a session to start arranging.</p>}</nav>
        <div className="section-heading library-heading"><h2>Sound library</h2><span className="count">{tracks.length}</span></div>
        <div className={"dropzone " + (dragging ? "dragging" : "")} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}>
          <span className="upload-icon">↑</span><strong>{uploading ? "Uploading…" : "Drop your tracks here"}</strong>
          <p>{uploading || "MP3, WAV, FLAC · " + (config?.max_upload_mb || 50) + " MB max"}</p>
          <button disabled={!!uploading} onClick={() => fileInput.current?.click()}>Browse files</button>
          <input ref={fileInput} type="file" accept=".mp3,.wav,.flac" multiple hidden onChange={e => { if (e.target.files) void upload(e.target.files); }} />
        </div>
        <p className="library-hint">Up to {Math.floor((config?.max_duration_seconds || 300) / 60)} minutes per track. Add up to {config?.max_project_tracks || 4} tracks per session.</p>
        <div className="library">{tracks.map(t => <article key={t.track_id} className="library-track">
          <div className="library-file"><span className="file-icon">♫</span><div><strong title={t.original_filename}>{t.original_filename}</strong>
          <small>{t.status === "completed" ? (t.bpm || "—") + " BPM · " + (t.key || "—") + " · " + clock(t.duration || 0) : t.stage}</small></div></div>
          {t.status === "completed" ? <button className="add-track" disabled={!project || selected.some(s => s.track_id === t.track_id) || selected.length >= (config?.max_project_tracks || 4)}
            onClick={() => addTrack(t)}>{selected.some(s => s.track_id === t.track_id) ? "Added ✓" : "+ Add to mix"}</button> :
          t.status === "failed" ? <><p className="error-inline small">{t.error_message}</p><button onClick={() => {
            void api("/api/tracks/" + t.track_id + "/retry", { method: "POST" }).catch(e => setError(message(e)));
          }}>Retry processing</button></> : <div className="processing-bar"><i /></div>}
        </article>)}</div>
        <div className="sidebar-foot"><span className="status-dot" />{config?.separation_mode === "demo" ? "Demo mode · identical placeholder stems" : "Four-stem separation"}</div>
      </aside>
      <main className="editor">
        <div className="editor-heading"><div><p className="eyebrow">THE MIXING ROOM</p>
          {project ? <input className="project-title" aria-label="Session title" maxLength={120} value={project.title} onChange={e => edit(p => ({ ...p, title: e.target.value }))} /> : <h1>Your next great mix.</h1>}
          <p className="muted">{project ? selected.length + " tracks · " + selected.length * 4 + " stems · " + saveState : "Start with a song. See where it takes you."}</p></div>
          <div className="header-actions">{project && <button onClick={() => persist(project).catch(e => setError(message(e)))}>Save</button>}
          <button className="primary" disabled={!audioReady || exporting || !duration} onClick={exportMix}>{exporting ? "Rendering WAV…" : "↓ Export WAV"}</button></div>
        </div>
        {config?.separation_mode === "demo" && <div className="demo-banner">Demo separation is enabled. All four stems contain the original audio. Enable real separation to isolate instruments.</div>}
        {!project || !selected.length ? <section className="empty-editor"><div className="empty-disc"><span>∿</span></div>
          <p className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</p><h2>{project ? "Every mix starts with a track." : "A blank canvas. A new sound."}</h2>
          <p>{project ? "Upload a song, then add it from your sound library. We'll give each part its own lane." : "Create your first session to start separating, arranging, and making something your own."}</p>
          <button className="primary" onClick={project ? () => fileInput.current?.click() : createProject}>{project ? "↑ Upload a track" : "+ Create a session"}</button>
          <div className="stem-legend">{Object.entries(colors).map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}</div>
        </section> : <div className="arrangement">
          <div className="arrangement-bar"><span>ARRANGEMENT</span><span>{audioState || "44.1 kHz · stereo"}</span>
            {audioState === "Audio unavailable" && <button onClick={() => setLoadRevision(n => n + 1)}>Retry audio</button>}</div>
          <div className="timeline-ruler"><span>STEMS</span><div>{Array.from({ length: 6 }, (_, i) => <span key={i}>{clock(duration * i / 5)}</span>)}</div><span>LEVEL</span></div>
          {selected.map((item, index) => {
            const track = tracks.find(t => t.track_id === item.track_id);
            if (!track) return <p key={item.track_id}>Loading track…</p>;
            return <section className="track-group" key={track.track_id}>
              <div className="track-heading"><button className="collapse-button" aria-label={"Toggle " + track.original_filename} aria-expanded={!collapsed[track.track_id]} onClick={() => setCollapsed(c => ({ ...c, [track.track_id]: !c[track.track_id] }))}>{collapsed[track.track_id] ? "▸" : "▾"}</button>
                <span className="track-number">{String(index + 1).padStart(2, "0")}</span><strong>{track.original_filename}</strong><span className="track-meta">{track.bpm} BPM <b>·</b> {track.key}</span>
                <label className="offset-control">Start <input type="number" min={0} max={300} step={0.1} aria-label={"Start offset for " + track.original_filename} value={item.offset_seconds}
                  onChange={e => { stop(); const offset = Math.max(0, Math.min(300, Number(e.target.value) || 0)); edit(p => ({ ...p, composition_data: { ...p.composition_data, tracks: p.composition_data.tracks.map(t => t.track_id === item.track_id ? { ...t, offset_seconds: offset } : t) } })); }} />s</label>
                <button className="remove-button" title="Remove from session" aria-label={"Remove " + track.original_filename} onClick={() => { stop(); edit(p => ({ ...p, composition_data: { ...p.composition_data, tracks: p.composition_data.tracks.filter(t => t.track_id !== track.track_id) } })); }}>×</button>
              </div>
              {!collapsed[track.track_id] && track.stems.map(stem => {
                const control = item.stems[stem.stem_type] || { active: true, solo: false, volume: 1 };
                return <div className={"stem-lane " + (!control.active ? "muted-lane" : "")} key={stem.id}>
                  <div className="stem-label"><i style={{ background: colors[stem.stem_type] }} /><span>{stem.stem_type}</span>
                    <button aria-label={"Mute " + stem.stem_type + " " + track.original_filename} aria-pressed={!control.active} className={!control.active ? "mute-active" : ""} onClick={() => stemEdit(track.track_id, stem.stem_type, { active: !control.active })}>M</button>
                    <button aria-label={"Solo " + stem.stem_type + " " + track.original_filename} aria-pressed={control.solo} className={control.solo ? "solo-active" : ""} onClick={() => stemEdit(track.track_id, stem.stem_type, { solo: !control.solo })}>S</button></div>
                  <div className="wave-area" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); void seek((e.clientX - rect.left) / rect.width * duration); }}>
                    <div className="wave-clip" style={{ left: item.offset_seconds / duration * 100 + "%", width: (track.duration || 0) / duration * 100 + "%", background: colors[stem.stem_type] + "12", borderColor: colors[stem.stem_type] + "40" }}><WaveLane buffer={mixer.current?.buffers.get(stem.id)} color={colors[stem.stem_type]} /></div>
                    <i className="playhead" style={{ left: position / duration * 100 + "%" }} />
                  </div>
                  <label className="stem-volume"><input aria-label={"Volume " + stem.stem_type + " " + track.original_filename} type="range" min={0} max={1} step={0.01} value={control.volume} onChange={e => stemEdit(track.track_id, stem.stem_type, { volume: Number(e.target.value) })} /><span>{Math.round(control.volume * 100)}</span></label>
                </div>;
              })}
            </section>;
          })}
          <div className="arrangement-tip"><span>＋</span> Add another track from your library to build your mix.</div>
        </div>}
        <footer className="editor-note"><span>Manual alignment · use Start to position each track</span><span>Space to play / pause</span></footer>
      </main>
    </div>
    <footer className="transport"><div className="transport-buttons"><button aria-label="Return to start" disabled={!audioReady} onClick={() => { void seek(0); }}>↤</button>
      <button className="play-button" aria-label={playing ? "Pause" : "Play"} disabled={!audioReady || exporting} onClick={() => { void play(); }}>{playing ? "Ⅱ" : "▶"}</button>
      <div className="time-display">{clock(position)}<small>/ {clock(duration)}</small></div></div>
      <input className="transport-seek" aria-label="Playhead position" type="range" min={0} max={duration || 1} step={0.05} value={position} disabled={!audioReady} onChange={e => { void seek(Number(e.target.value)); }} />
      <label className="master-volume">MASTER<input type="range" aria-label="Master volume" min={0} max={1} step={0.01} value={project?.composition_data.master_volume ?? .8} disabled={!project}
        onChange={e => edit(p => ({ ...p, composition_data: { ...p.composition_data, master_volume: Number(e.target.value) } }))} /><span>{Math.round((project?.composition_data.master_volume ?? .8) * 100)}%</span></label>
    </footer>
  </div>;
}
