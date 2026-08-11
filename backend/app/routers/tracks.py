import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload

from app.deps import get_current_user
from app.database import get_db
from app.models import Track, TrackStatus, User
from app.schemas import TrackStatusResponse, TrackUploadResponse
from app.services.storage import build_key, ensure_bucket, upload_fileobj
from app.tasks import process_track

router = APIRouter(prefix="/api/tracks", tags=["tracks"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac"}


@router.post("/upload", response_model=TrackUploadResponse)
async def upload_track(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}")

    ensure_bucket()

    track_id = uuid.uuid4()
    key = build_key("originals", str(track_id), file.filename)
    file_url = upload_fileobj(file.file, key, content_type=file.content_type)

    track = Track(
        id=track_id,
        user_id=user.id,
        original_filename=file.filename,
        file_url=file_url,
        status=TrackStatus.pending,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    process_track.delay(str(track.id))

    return TrackUploadResponse(track_id=track.id, status=track.status)


@router.get("/{track_id}/status", response_model=TrackStatusResponse)
def get_track_status(track_id: uuid.UUID, db: Session = Depends(get_db)):
    track = (
        db.query(Track)
        .options(joinedload(Track.stems))
        .filter(Track.id == track_id)
        .first()
    )
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    return TrackStatusResponse(
        track_id=track.id,
        status=track.status,
        bpm=track.bpm,
        key=track.musical_key,
        original_filename=track.original_filename,
        error_message=track.error_message,
        stems=track.stems,
    )
