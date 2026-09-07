import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, and_
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from app.config import settings
from app.deps import get_current_user
from app.database import get_db
from app.models import Track, TrackStatus, User
from app.schemas import TrackStatusResponse, TrackUploadResponse
from app.services.storage import ensure_bucket, get_s3_client, object_key, upload_file
from app.tasks import process_track

router = APIRouter(prefix="/api/tracks", tags=["tracks"])
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac"}


def serialize(track):
    return TrackStatusResponse(
        track_id=track.id, status=track.status, stage=track.stage,
        duration=track.duration, bpm=track.bpm, key=track.musical_key,
        retryable=track.status == TrackStatus.failed or (track.status != TrackStatus.completed and
            track.updated_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc) - timedelta(minutes=75)),
        original_filename=track.original_filename, error_message=track.error_message,
        stems=[{"id": s.id, "stem_type": s.stem_type,
                "stem_url": f"/api/tracks/{track.id}/stems/{s.id}/audio"} for s in track.stems])


def owned_track(db, track_id, user):
    track = db.query(Track).options(joinedload(Track.stems)).filter(
        Track.id == track_id, Track.user_id == user.id).first()
    if track is None:
        raise HTTPException(404, "Track not found")
    return track


def dispatch(db, track):
    try:
        process_track.delay(str(track.id))
    except Exception:
        track.status = TrackStatus.failed
        track.stage = "failed"
        track.error_message = "Processing queue unavailable. Please retry."
        db.commit()
        raise HTTPException(503, track.error_message) from None


@router.post("/upload", response_model=TrackUploadResponse)
def upload_track(file: UploadFile = File(...), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    filename = (file.filename or "audio").replace("\\", "/").split("/")[-1][:200]
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Choose an MP3, WAV, or FLAC file")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "source" + ext)
        size = 0
        with open(path, "wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_mb * 1024 * 1024:
                    raise HTTPException(413, f"Maximum upload is {settings.max_upload_mb} MB")
                out.write(chunk)
        try:
            probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                "-show_entries", "stream=codec_type:format=duration", "-of", "json", path],
                check=True, capture_output=True, text=True, timeout=30)
            info = json.loads(probe.stdout)
            duration = float(info["format"]["duration"])
            if not info.get("streams") or not 0 < duration <= settings.max_duration_seconds:
                raise ValueError()
            subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", path,
                "-t", str(settings.max_duration_seconds + 1), "-f", "null", "-"],
                check=True, capture_output=True, timeout=60)
        except (subprocess.SubprocessError, ValueError, KeyError):
            raise HTTPException(422, f"Audio must be decodable and at most {settings.max_duration_seconds} seconds") from None
        ensure_bucket()
        track_id = uuid.uuid4()
        key = upload_file(path, f"originals/{track_id}/source{ext}", file.content_type)
    track = Track(id=track_id, user_id=user.id, original_filename=filename,
        file_url=key, duration=duration, status=TrackStatus.pending, stage="queued")
    db.add(track)
    db.commit()
    dispatch(db, track)
    return TrackUploadResponse(track_id=track.id, status=track.status)


@router.get("", response_model=list[TrackStatusResponse])
def list_tracks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tracks = db.query(Track).options(joinedload(Track.stems)).filter(
        Track.user_id == user.id).order_by(Track.created_at.desc()).limit(100).all()
    return [serialize(track) for track in tracks]


@router.get("/{track_id}/status", response_model=TrackStatusResponse)
def get_track_status(track_id: uuid.UUID, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    return serialize(owned_track(db, track_id, user))


@router.post("/{track_id}/retry", response_model=TrackStatusResponse)
def retry(track_id: uuid.UUID, db: Session = Depends(get_db),
          user: User = Depends(get_current_user)):
    track = owned_track(db, track_id, user)
    updated = db.query(Track).filter(Track.id == track.id, or_(Track.status == TrackStatus.failed,
        and_(Track.status.in_([TrackStatus.pending, TrackStatus.processing]),
             Track.updated_at < datetime.now(timezone.utc) - timedelta(minutes=75)))).update({
        Track.status: TrackStatus.pending, Track.stage: "queued", Track.error_message: None}, synchronize_session=False)
    if not updated:
        raise HTTPException(409, "Only failed tracks or jobs stalled for 75 minutes can be retried")
    db.commit()
    db.refresh(track)
    dispatch(db, track)
    return serialize(track)


@router.get("/{track_id}/stems/{stem_id}/audio")
def stem_audio(track_id: uuid.UUID, stem_id: uuid.UUID, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    track = owned_track(db, track_id, user)
    stem = next((s for s in track.stems if s.id == stem_id), None)
    if stem is None:
        raise HTTPException(404, "Stem not found")
    obj = get_s3_client().get_object(Bucket=settings.s3_bucket_name, Key=object_key(stem.stem_url))
    def chunks():
        try:
            yield from obj["Body"].iter_chunks(chunk_size=256 * 1024)
        finally:
            obj["Body"].close()
    return StreamingResponse(chunks(), media_type="audio/wav",
        headers={"Content-Length": str(obj["ContentLength"]), "Cache-Control": "private, no-store"})
