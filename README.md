# DissectTune

AI-powered multi-track mashup & stem-mixing platform. Upload audio, split it into
Vocals/Drums/Bass/Other stems, detect BPM and musical key, and mix multiple tracks
together in a browser-based DAW-style deck.

## Architecture

```
Next.js frontend  ──HTTP──>  FastAPI backend  ──Celery task──>  Redis broker
                                   │                                  │
                                   ├─► PostgreSQL (metadata)          ▼
                                   └─► S3 / R2 (audio blobs)   Celery worker
                                                                 ├─ HTDemucs (stems)
                                                                 └─ Librosa (BPM/key)
```

See the full technical spec for schema and API details.

## Repo layout

- `backend/` — FastAPI app, SQLAlchemy models, Alembic migrations, Celery worker/tasks
- `frontend/` — Next.js (TypeScript) app: upload flow + Wavesurfer-based mixing deck
- `docker-compose.yml` — Postgres, Redis, MinIO (local S3), API, worker, frontend

## Running locally (Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000 (docs at `/docs`)
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

The first `api` container run applies Alembic migrations automatically.

## Stem separation: stub vs. real HTDemucs

By default (`USE_REAL_DEMUCS=false`), the worker's separation step is **stubbed**:
it copies the source audio into 4 placeholder stem files so the full pipeline
(upload → queue → storage → DB → mixing UI) works end-to-end without a GPU or the
~1-2GB HTDemucs model download.

To run real separation:

1. Build the worker image with Demucs/Torch installed:
   `docker compose build --build-arg INSTALL_DEMUCS=true worker`
2. Set `USE_REAL_DEMUCS=true` in `.env` (and ideally run the worker on a
   GPU-equipped host — see the tech spec's infra section for RunPod/Lambda Labs
   GPU node guidance).

## Running without Docker

Backend:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # or strip demucs/torch/pyrubberband for a light install
cp ../.env.example .env
alembic upgrade head
uvicorn app.main:app --reload
# in a second shell:
celery -A app.celery_app worker --loglevel=info
```

Requires local Postgres, Redis, and an S3-compatible store (e.g. MinIO) reachable
at the URLs configured in `backend/app/config.py` / `.env`.

Frontend:

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tracks/upload` | Upload an audio file, kicks off async processing |
| GET | `/api/tracks/{track_id}/status` | Poll processing status, BPM/key, stem URLs |
| POST | `/api/projects` | Create a mix project from a set of tracks |
| GET | `/api/projects/{project_id}` | Fetch a mix project |
| PUT | `/api/projects/{project_id}` | Update mix parameters (volume/pitch/offsets) |

## Notes / follow-ups

- Auth is a minimal placeholder (`X-User-Email` header auto-provisions a user
  row) — swap in real auth before any multi-user deployment.
- Real-time pitch/tempo correction (PyRubberBand) is wired as a dependency but
  not yet exposed via an API endpoint — the mix project's `composition_data`
  JSON already has fields (`pitch_shift`, `offset_seconds`) to build it on.
- WebSocket-based status push (instead of polling) is a natural next step once
  the polling flow is validated end-to-end.
