"""Run against Docker: python tests/smoke_live.py. Creates isolated synthetic test data."""
import io
import json
import os
import math
from pathlib import Path
import struct
import time
import uuid
import wave
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
base = "http://localhost:" + os.getenv("API_PORT", "8000")
email = "smoke-" + uuid.uuid4().hex[:10] + "@example.com"
password = "Mvp-smoke-test-123"
client = httpx.Client(base_url=base, timeout=120)
response = client.post("/api/auth/register", json={"email": email, "password": password})
response.raise_for_status()
client.headers["Authorization"] = "Bearer " + response.json()["token"]
config = client.get("/api/config").json()
print("Separation mode:", config["separation_mode"], flush=True)
ids = []
for index, name in enumerate(("Midnight signal.wav", "Afterglow rhythm.wav")):
    data = io.BytesIO()
    with wave.open(data, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(44100)
        samples = bytearray()
        for i in range(44100 * 6):
            t = i / 44100
            tone = .18 * math.sin(2 * math.pi * (220 + 55 * index) * t)
            tone += .10 * math.sin(2 * math.pi * 110 * t) * math.exp(-12 * (t % .5))
            samples.extend(struct.pack("<h", int(tone * 32767)))
        output.writeframes(samples)
    result = client.post("/api/tracks/upload", files={"file": (name, data.getvalue(), "audio/wav")})
    result.raise_for_status()
    ids.append(result.json()["track_id"])
deadline = time.monotonic() + 1200
last = None
while time.monotonic() < deadline:
    tracks = [client.get("/api/tracks/" + track_id + "/status").json() for track_id in ids]
    stages = [track["stage"] for track in tracks]
    if stages != last:
        print("Processing:", stages, flush=True)
        last = stages
    assert not any(track["status"] == "failed" for track in tracks), tracks
    if all(track["status"] == "completed" for track in tracks):
        break
    time.sleep(3)
else:
    raise TimeoutError("Processing did not finish in 20 minutes")
for track in tracks:
    assert len(track["stems"]) == 4
    contents = []
    for stem in track["stems"]:
        result = client.get(stem["stem_url"])
        result.raise_for_status()
        assert result.content[:4] == b"RIFF"
        with wave.open(io.BytesIO(result.content)) as audio:
            assert audio.getnframes() > 0
        contents.append(result.content)
        assert httpx.get(base + stem["stem_url"]).status_code == 401
    if config["separation_mode"] == "demucs":
        assert len(set(contents)) == 4, "Real separation must not duplicate the input"
project = client.post("/api/projects", json={"title": "MVP live session", "track_ids": ids})
project.raise_for_status()
project = project.json()
body = {key: project[key] for key in ("title", "master_bpm", "composition_data")}
body["composition_data"]["tracks"][1]["offset_seconds"] = .5
body["composition_data"]["tracks"][0]["stems"]["vocals"]["solo"] = True
updated = client.put("/api/projects/" + project["id"], json=body)
updated.raise_for_status()
assert client.get("/api/projects/" + project["id"]).json()["composition_data"] == body["composition_data"]
artifacts = Path(__file__).resolve().parents[2] / "artifacts"
artifacts.mkdir(exist_ok=True)
(artifacts / "live-smoke.json").write_text(json.dumps({"email": email, "project_id": project["id"],
    "track_ids": ids, "separation_mode": config["separation_mode"]}), encoding="utf-8")
print("PASS: two uploads, eight private WAV stems, project save/load. Fixture:", email, flush=True)
