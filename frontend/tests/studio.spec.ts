import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function wav() {
  const frames = 44100 * 2, buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF"); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24); buffer.writeUInt32LE(88200, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 440 / 44100) * 1000), 44 + i * 2);
  return buffer;
}
const kinds = ["vocals", "drums", "bass", "other"];
const tracks = ["Midnight.wav", "Afterglow.wav"].map((name, i) => ({
  track_id: "track-" + i, original_filename: name, status: "completed", stage: "ready",
  duration: 2, bpm: 120, key: "Am", error_message: null,
  stems: kinds.map(kind => ({ id: i + "-" + kind, stem_type: kind, stem_url: "/api/audio/" + i + "/" + kind })),
}));

test("mix two tracks, save, restore, seek, and export a valid WAV", async ({ page }) => {
  let project = { id: "project-1", title: "Night session", master_bpm: null, updated_at: new Date().toISOString(),
    composition_data: { master_volume: .8, tracks: [] as unknown[] } };
  await page.addInitScript(() => sessionStorage.setItem("dissecttune-token", "test"));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers });
    if (path.startsWith("/api/audio/")) return route.fulfill({ body: wav(), contentType: "audio/wav", headers });
    let data: unknown;
    if (path === "/api/config") data = { separation_mode: "demucs", max_upload_mb: 50, max_duration_seconds: 300, max_project_tracks: 4 };
    else if (path === "/api/auth/me") data = { email: "producer@example.com" };
    else if (path === "/api/tracks") data = tracks;
    else if (path === "/api/projects") data = [project];
    else if (path === "/api/projects/project-1") {
      if (route.request().method() === "PUT") project = { ...project, ...route.request().postDataJSON() };
      data = project;
    } else throw new Error("Unexpected request " + path);
    await route.fulfill({ json: data, headers });
  });
  const errors: string[] = [];
  page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
  await page.goto("/");
  await page.getByRole("button", { name: "Night session" }).click();
  await page.getByRole("button", { name: "+ Add to mix", exact: true }).first().click();
  await page.getByRole("button", { name: "+ Add to mix", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await expect(page.locator(".stem-lane")).toHaveCount(8);
  await page.getByLabel("Solo vocals Midnight.wav").click();
  await expect(page.getByLabel("Solo vocals Midnight.wav")).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Start offset for Afterglow.wav").fill("0.5");
  await page.getByLabel("Tempo ratio for Afterglow.wav").fill("1.1");
  await page.getByLabel("Pitch semitones for Afterglow.wav").fill("2");
  await page.getByLabel("Session title").fill("Midnight rework");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => project.title).toBe("Midnight rework");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "test-results/studio-desktop.png", fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export WAV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const exported = readFileSync(path!);
  expect(exported.toString("ascii", 0, 4)).toBe("RIFF");
  expect(exported.readUInt16LE(22)).toBe(2);
  expect(exported.readUInt32LE(24)).toBe(44100);
  expect(exported.readUInt32LE(40)).toBe(2.5 * 44100 * 4);
  await page.reload();
  await page.getByRole("button", { name: "Midnight rework" }).click();
  await expect(page.locator(".stem-lane")).toHaveCount(8);
  await expect(page.getByLabel("Start offset for Afterglow.wav")).toHaveValue("0.5");
  await expect(page.getByLabel("Tempo ratio for Afterglow.wav")).toHaveValue("1.1");
  await expect(page.getByLabel("Pitch semitones for Afterglow.wav")).toHaveValue("2");
  await expect(page.getByLabel("Solo vocals Midnight.wav")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/studio-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test("welcome is usable on desktop and mobile", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({ json: { separation_mode: "demucs" } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your studio." })).toBeVisible();
  await page.screenshot({ path: "test-results/welcome-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/welcome-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("real Web Audio rendering respects offsets, solo, mute, master gain, and WAV encoding", async ({ page }) => {
  await page.goto("/");
  const source = readFileSync("src/lib/audio.ts", "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const result = await page.evaluate(async compiled => {
    const exports: Record<string, any> = {};
    new Function("exports", "require", compiled)(exports, () => ({}));
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const buffer = ctx.createBuffer(1, 11025, 44100);
    buffer.getChannelData(0).fill(.5);
    const buffers = new Map([["v", buffer], ["d", buffer]]);
    const tracks = [{ track_id: "t", stems: [{ id: "v", stem_type: "vocals" }, { id: "d", stem_type: "drums" }] }];
    const composition = { master_volume: .5, tracks: [{ track_id: "t", offset_seconds: .25, tempo_ratio: 1.25, pitch_semitones: 3, stems: {
      vocals: { active: true, solo: true, volume: .5 }, drums: { active: true, solo: false, volume: 1 },
    } }] };
    const voices = exports.audibleVoices(composition, tracks, buffers);
    const master = ctx.createGain(); master.gain.value = composition.master_volume; master.connect(ctx.destination);
    voices.forEach((v: any) => exports.scheduleVoice(ctx, v, master, 0, 0));
    const output = await ctx.startRendering();
    const samples = output.getChannelData(0);
    composition.tracks[0].stems.vocals.active = false;
    const muted = exports.audibleVoices(composition, tracks, buffers);
    const blob = exports.encodeWav(output);
    const data = new DataView(await blob.arrayBuffer());
    return { before: samples[100], during: samples[12000], after: samples[23000],
      gains: voices.map((v: any) => v.volume), rates: voices.map((v: any) => [v.tempoRatio, v.pitchSemitones]), muted: muted.map((v: any) => v.volume),
      pcm: data.getInt16(44 + 12000 * 4, true), frames: data.getUint32(40, true) / 4 };
  }, js);
  expect(result.before).toBe(0);
  expect(result.during).toBeCloseTo(.125, 5);
  expect(result.after).toBe(0);
    expect(result.gains).toEqual([.5, 0]);
    expect(result.rates).toEqual([[1.25, 3], [1.25, 3]]);
  expect(result.muted).toEqual([0, 0]);
  expect(result.pcm).toBe(4095);
  expect(result.frames).toBe(44100);
});
