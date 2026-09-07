# Local MVP acceptance

Verified September 6, 2026 (America/Toronto).

## Passed

- Clean frontend dependency installation and production Docker build.
- TypeScript typecheck and ESLint, with no lint errors or warnings.
- Eight backend tests: password/token handling, ownership boundaries, project
  validation and persistence, private audio access, dispatch recovery, stale-job
  recovery, idempotent processing, stable stem ordering and silent-audio metadata.
- Four Chromium browser tests, including a live production-stack test.
- Two generated six-second audio clips uploaded through the real API and processed
  by HTDemucs FT on the CPU worker. Each produced four distinct playable WAV files.
- Private stem endpoints reject unauthenticated access. Separate-account ownership
  rejection is also covered by backend tests.
- Project offsets and solo settings survive API save/load and browser reload.
- Live browser playback advances the shared playhead; WAV export produces a nonempty
  44.1 kHz stereo PCM file with the expected arrangement duration.
- OfflineAudioContext sample checks verify silence before/after a clip, its offset,
  stem/master gain multiplication, global solo, mute precedence and PCM encoding.
- Desktop/mobile screenshots inspected; responsive tests confirm no page overflow.
- Production npm dependency audit: zero reported vulnerabilities at verification time.
- GitHub Actions workflow added for backend tests, frontend build and browser checks.
  The workflow was not pushed or run on GitHub during this local task.

## Running services

- Studio: http://localhost:3000
- API docs for this checkout: http://localhost:8001/docs
- MinIO console: http://localhost:9001

Windows reserves port 8000 here. The ignored local environment uses API_PORT=8001;
the checked-in example remains configurable. Docker data volumes and downloaded
model weights are retained. Test-created accounts, clips and sessions remain in
the local database/storage for inspection.

## Scope of evidence

The inference check uses generated tonal/rhythmic audio, not a listening-quality
benchmark on full songs. Full-length processing time and maximum-size browser memory
use were not benchmarked. The editor applies a temporary 1 GB decoded-audio budget and upload limits.
GPU execution was not tested; the verified worker is CPU-only.

This is a local MVP. Public hosting still needs deployment configuration, HTTPS,
non-default infrastructure credentials, a strong AUTH_SECRET, reverse-proxy rate/body
limits, and an operational backup policy. No public deployment or Git push was made.
Automatic beat alignment, pitch/tempo processing, effects, MP3 export, collaboration,
password reset and email verification remain outside the implemented scope.

## Reproduce the live browser check

After starting Docker and installing test dependencies:

```powershell
cd backend
.venv/Scripts/python.exe tests/smoke_live.py
cd ../frontend
$env:LIVE_MVP = '1'
npm test
```

The smoke script records the test account identifier and project IDs in ignored
artifacts/live-smoke.json. The live browser test uses that fixture. Screenshots and
failure traces are generated under frontend/test-results/.
