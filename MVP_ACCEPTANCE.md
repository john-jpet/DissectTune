# Local acceptance report

The application is verified as a local Docker-based MVP. Backend tests cover
authentication, ownership, project validation, private audio access, processing
recovery, and audio metadata. Frontend checks cover the studio workflow, persistence,
responsive layout, playback scheduling, and WAV encoding.

Run the checks from a clean checkout with Docker running:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
cd backend
python -m pytest tests -q
cd ..\frontend
npm ci
npm run typecheck
npm test
```

The default real-separation path downloads large CPU inference dependencies and model
weights. Set `USE_REAL_DEMUCS=false` and `INSTALL_DEMUCS=false` for a lightweight demo;
demo mode intentionally produces labelled placeholder stems.

Known scope: BPM and musical-key values are estimates, alignment is manual, and the
editor is primarily aimed at desktop browsers. Public deployment needs HTTPS, strong
unique credentials, private database/Redis/object-storage networking, CORS restricted
to the frontend origin, reverse-proxy limits, backups, and monitoring.
