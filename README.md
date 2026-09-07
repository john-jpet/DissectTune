# DissectTune Studio

Local verification results and limitations: [MVP_ACCEPTANCE.md](MVP_ACCEPTANCE.md).

Separate songs into vocals, drums, bass and other; combine their stems in a browser
studio; save the arrangement; export a stereo WAV.

## Start locally

Start Docker Desktop's Linux engine, then:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

Open http://localhost:3000 and create an account. API documentation is at
http://localhost:8000/docs by default. MinIO's local console is at
http://localhost:9001 (`minioadmin` / `minioadmin`).
All published service ports bind to localhost.

If Windows reserves port 8000, set `API_PORT=8001` in `.env` and rebuild.
The frontend image receives the corresponding API URL at build time.
This checkout's ignored local environment uses **8001**.

The API applies migrations and initializes a private storage bucket before the worker
starts. PostgreSQL, Redis, uploaded audio and model weights use persistent Docker volumes.
The first build and first inference download dependencies/model weights. CPU inference
can take several minutes. The worker processes one job at a time to bound memory.

The example environment enables real `htdemucs_ft` separation on CPU. For a lightweight
development demo, set both flags and rebuild:

```dotenv
USE_REAL_DEMUCS=false
INSTALL_DEMUCS=false
```

Demo mode creates four valid WAV copies of the original; the UI labels this explicitly.
It exercises the workflow but does not isolate instruments.

## Make a mix

1. Create a session.
2. Drag in MP3, WAV or FLAC files, or select multiple files with Browse.
3. Watch queued, analyzing, separating and storing stages in the library.
4. Add completed tracks to the session.
5. Press Play or Space. Adjust mute, solo, per-stem volume and master volume.
6. Set each track's **Start** offset in seconds to align it. Offset changes pause playback.
   Click the waveform or use the transport slider to seek.
7. Changes autosave after a short pause. Save retries explicitly if saving failed.
8. Export WAV downloads 44.1 kHz, stereo, 16-bit PCM audio.

Sessions reopen from the sidebar after refresh. Your account token stays in the current
tab's sessionStorage; closing the tab requires signing in again. Removing a track from
a session leaves its original and stems in the library.

Mute wins over solo. When any stem is soloed, every non-soloed stem is silent across
the project. Playback and export share scheduling and gain rules. Lower levels if
summing sources distorts: the WAV encoder clamps samples to PCM range, without normalization.

## Limits and deferred features

- 50 MB / 300 seconds per source and four tracks per project by default.
- A 512 MB estimated decoded-audio budget protects browser memory. Long mixes may
  require shorter tracks or fewer songs. Desktop browsers are the primary editor target.
- BPM/key are estimates. Alignment is manual; automatic beat matching, pitch shifting,
  tempo stretching, effects and MP3 export are deferred.
- The upload queue runs sequentially; separation continues independently on the worker.
- Transient storage connection failures retry twice. Failed tracks can be retried.
  Jobs stalled for 75 minutes expose Retry, beyond the worker's hard execution limit.
- Library/project lists currently return the latest 100 entries.
- Collaboration, password reset, email verification and permanent library deletion are deferred.
- Migrations retain old demo-account data, but do not assign it to newly registered users.

## Implementation and evidence

| Capability | Code |
|---|---|
| Password hashing and signed expiring bearer tokens | `backend/app/services/auth.py`, `routers/auth.py` |
| Validated uploads, ownership, authenticated WAV streaming and retry | `backend/app/routers/tracks.py` |
| Celery stages, atomic job claiming and stem replacement | `backend/app/tasks.py` |
| Real Demucs invocation and valid WAV demo output | `backend/app/services/separation.py` |
| BPM/key estimates | `backend/app/services/analysis.py` |
| Validated compositions and persistence | `backend/app/schemas.py`, `routers/projects.py` |
| Studio, library, upload queue and autosave | `frontend/src/components/Studio.tsx` |
| Shared playback clock and offline WAV rendering | `frontend/src/lib/audio.ts` |
| Canvas waveforms from decoded audio | `frontend/src/components/WaveLane.tsx` |

The worker downloads private objects through authenticated S3 calls:

```python
get_s3_client().download_file(settings.s3_bucket_name, object_key(key), dest_path)
```

The browser fetches owned stems through authenticated API endpoints, never public
bucket URLs. The shared engine schedules every source against one audio clock:

```typescript
source.start(when + Math.max(0, voice.offset - position), skip);
```

Export uses that same scheduler inside `OfflineAudioContext`. Composition JSON stores
`master_volume`, ordered `tracks`, `offset_seconds`, and each stem's
`active`, `solo`, `volume`. The API validates ownership, readiness and stem membership.

## Verification

Backend tests use SQLite and mocked storage/queue boundaries:

```powershell
cd backend
python -m pytest tests -q
```

Install the backend runtime dependencies and pytest/httpx first. The current
`requirements-dev.txt` also includes optional inference dependencies through
`requirements.txt`; the Docker API build skips those heavy dependencies.

Frontend:

```powershell
cd frontend
npm ci
npm run typecheck
npm run lint
npx playwright install chromium
npm test
```

Browser tests cover two-track editing, autosave/restoration, valid WAV download,
responsive layouts, and rendered audio samples for offsets, mute, solo and master gain.
Screenshots go to ignored `frontend/test-results/`.

With the Docker stack running, verify real storage, queue and inference:

```powershell
cd backend
python tests/smoke_live.py
```

This creates an isolated test account and two synthetic six-second tracks, checks eight
private WAVs and project save/load, and writes an ignored report to
`artifacts/live-smoke.json`. Real mode additionally requires distinct stem outputs.
Test data remains in the local library/database.

Native development uses Turbopack because Webpack rejects paths containing `!`, such
as this checkout's parent directory. Production builds run in Docker at `/app`;
a native production build requires a checkout path without `!`.

## Hosting considerations

Compose is configured for local operation. Before public hosting, set
`APP_ENV=production` and a random `AUTH_SECRET` of at least 32 characters; the API
rejects the development secret in production. Use HTTPS, private DB/Redis/S3 networking,
non-default infrastructure credentials, appropriate CORS origins and reverse-proxy
request/rate limits. Set the public API URL when building the frontend.

Tokens expire after seven days by default; changing AUTH_SECRET invalidates existing
sessions. GPU workers require a compatible `TORCH_INDEX_URL` build argument and explicit
host GPU access configuration. The default worker uses CPU inference.
