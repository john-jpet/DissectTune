import io
import uuid
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app
from app.models import Stem, StemType, Track, TrackStatus, User
from app.services.auth import hash_password, check_password, issue_token, read_token
from app.services.storage import object_key
from app.schemas import Composition


@pytest.fixture
def setup():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    def dependency():
        with factory() as session:
            yield session
    app.dependency_overrides[get_db] = dependency
    with TestClient(app) as client:
        yield client, factory
    app.dependency_overrides.clear()
    engine.dispose()


def account(client, name):
    result = client.post("/api/auth/register", json={"email": name + "@example.com", "password": "test-password-123"})
    assert result.status_code == 201, result.text
    return {"Authorization": "Bearer " + result.json()["token"]}


def seed(factory, email, status=TrackStatus.completed):
    with factory() as db:
        user = db.query(User).filter_by(email=email).one()
        track = Track(user_id=user.id, original_filename="sample.wav", file_url="originals/example.wav",
                      status=status, duration=3, bpm=120, musical_key="C", stage="ready")
        db.add(track)
        db.flush()
        for kind in StemType:
            db.add(Stem(track_id=track.id, stem_type=kind, stem_url="stems/" + kind.value + ".wav"))
        db.commit()
        return str(track.id)


def test_password_and_token():
    encoded = hash_password("long-password")
    assert check_password("long-password", encoded)
    assert not check_password("wrong-password", encoded)
    assert encoded != hash_password("long-password")
    user_id = uuid.uuid4()
    token = issue_token(user_id)
    assert read_token(token) == user_id
    with pytest.raises(Exception):
        read_token(token + "bad")
    with patch("app.services.auth.time.time", return_value=10**12):
        with pytest.raises(Exception):
            read_token(token)


def test_auth_and_ownership(setup):
    client, factory = setup
    alice, bob = account(client, "alice"), account(client, "bob")
    assert client.get("/api/tracks").status_code == 401
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-password"}).status_code == 401
    track_id = seed(factory, "alice@example.com")
    assert len(client.get("/api/tracks", headers=alice).json()) == 1
    assert client.get("/api/tracks", headers=bob).json() == []
    assert client.get(f"/api/tracks/{track_id}/status", headers=bob).status_code == 404
    project = client.post("/api/projects", headers=alice, json={"title": "Mix", "track_ids": [track_id]}).json()
    url = "/api/projects/" + project["id"]
    assert client.get(url, headers=bob).status_code == 404
    payload = {k: project[k] for k in ("title", "master_bpm", "composition_data")}
    assert client.put(url, headers=bob, json=payload).status_code == 404
    payload["composition_data"]["tracks"][0]["stems"]["vocals"]["solo"] = True
    payload["composition_data"]["tracks"][0]["offset_seconds"] = 1.5
    assert client.put(url, headers=alice, json=payload).status_code == 200
    assert client.get(url, headers=alice).json()["composition_data"] == payload["composition_data"]
    assert client.post("/api/projects", headers=bob, json={"title": "Stolen", "track_ids": [track_id]}).status_code == 422


def test_project_validation_and_private_audio(setup):
    client, factory = setup
    headers = account(client, "listener")
    track_id = seed(factory, "listener@example.com")
    project = client.post("/api/projects", headers=headers, json={"title": "Mix", "track_ids": [track_id]}).json()
    payload = {k: project[k] for k in ("title", "master_bpm", "composition_data")}
    payload["composition_data"]["tracks"][0]["stems"]["vocals"]["volume"] = 2
    assert client.put("/api/projects/" + project["id"], headers=headers, json=payload).status_code == 422
    assert client.post("/api/projects", headers=headers, json={"title": "Mix", "track_ids": [track_id, track_id]}).status_code == 422
    track = client.get(f"/api/tracks/{track_id}/status", headers=headers).json()
    audio_url = track["stems"][0]["stem_url"]
    assert audio_url.startswith("/api/tracks/")
    assert client.get(audio_url).status_code == 401
    from botocore.response import StreamingBody
    with patch("app.routers.tracks.get_s3_client") as storage:
        storage.return_value.get_object.return_value = {"Body": StreamingBody(io.BytesIO(b"RIFF"), 4), "ContentLength": 4}
        response = client.get(audio_url, headers=headers)
    assert response.content == b"RIFF"
    assert response.headers["cache-control"] == "private, no-store"


def test_invalid_upload_and_dispatch_recovery(setup):
    client, factory = setup
    headers = account(client, "upload")
    assert client.post("/api/tracks/upload", headers=headers, files={"file": ("bad.exe", b"bad")}).status_code == 400
    track_id = seed(factory, "upload@example.com", TrackStatus.failed)
    with patch("app.routers.tracks.process_track.delay", side_effect=ConnectionError()):
        assert client.post(f"/api/tracks/{track_id}/retry", headers=headers).status_code == 503
    assert client.get(f"/api/tracks/{track_id}/status", headers=headers).json()["status"] == "failed"
    with patch("app.routers.tracks.process_track.delay") as queue:
        assert client.post(f"/api/tracks/{track_id}/retry", headers=headers).status_code == 200
        assert client.post(f"/api/tracks/{track_id}/retry", headers=headers).status_code == 409
        queue.assert_called_once()


def test_storage_keys_and_composition_limits():
    assert object_key("stems/id/vocals.wav") == "stems/id/vocals.wav"
    assert object_key("http://localhost:9000/dissecttune/stems/id/vocals.wav") == "stems/id/vocals.wav"
    with pytest.raises(ValueError):
        Composition.model_validate({"tracks": [], "master_volume": float("nan")})


def test_stale_processing_can_be_retried(setup):
    from datetime import datetime, timedelta, timezone
    client, factory = setup
    headers = account(client, "stale")
    track_id = seed(factory, "stale@example.com", TrackStatus.processing)
    with factory() as db:
        track = db.get(Track, uuid.UUID(track_id))
        track.updated_at = datetime.now(timezone.utc) - timedelta(minutes=80)
        db.commit()
    assert client.get(f"/api/tracks/{track_id}/status", headers=headers).json()["retryable"]
    with patch("app.routers.tracks.process_track.delay"):
        assert client.post(f"/api/tracks/{track_id}/retry", headers=headers).status_code == 200


def test_worker_claim_and_stem_replacement(setup, tmp_path):
    _, factory = setup
    client = setup[0]
    account(client, "worker")
    track_id = seed(factory, "worker@example.com", TrackStatus.pending)
    from app.tasks import process_track
    outputs = {kind.value: str(tmp_path / (kind.value + ".wav")) for kind in StemType}
    with patch("app.tasks.SessionLocal", factory), patch("app.tasks.download_to_path"), \
         patch("app.tasks.analyze_bpm_and_key", return_value=(123, "Am")), \
         patch("app.tasks.separate_stems", return_value=outputs) as separate, \
         patch("app.tasks.upload_file", side_effect=lambda path, key, content_type: key):
        process_track.run(track_id)
        process_track.run(track_id)
        separate.assert_called_once()
    with factory() as db:
        track = db.get(Track, uuid.UUID(track_id))
        assert track.status == TrackStatus.completed
        assert track.bpm == 123
        assert len(track.stems) == 4
