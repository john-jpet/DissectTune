import os
import tempfile
import uuid
from botocore.exceptions import ConnectionClosedError, EndpointConnectionError, ReadTimeoutError
from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import Stem, StemType, Track, TrackStatus
from app.services.analysis import analyze_bpm_and_key
from app.services.separation import separate_stems
from app.services.storage import download_to_path, upload_file


@celery_app.task(name="app.tasks.process_track", bind=True, max_retries=2,
                soft_time_limit=3900, time_limit=3960)
def process_track(self, track_id: str):
    db = SessionLocal()
    try:
        claimed = db.query(Track).filter(Track.id == uuid.UUID(track_id),
            Track.status == TrackStatus.pending).update({
                Track.status: TrackStatus.processing, Track.stage: "analyzing"})
        db.commit()
        if not claimed:
            return
        track = db.get(Track, uuid.UUID(track_id))
        with tempfile.TemporaryDirectory(prefix="dissecttune_") as tmp:
            local = os.path.join(tmp, "source" + os.path.splitext(track.original_filename)[1].lower())
            download_to_path(track.file_url, local)
            bpm, key = analyze_bpm_and_key(local)
            track.stage = "separating"
            db.commit()
            paths = separate_stems(local, tmp)
            track.stage = "storing"
            db.commit()
            urls = {name: upload_file(path, f"stems/{track_id}/{name}.wav", "audio/wav")
                    for name, path in paths.items()}
            db.query(Stem).filter(Stem.track_id == track.id).delete()
            for name, url in urls.items():
                db.add(Stem(track_id=track.id, stem_type=StemType(name), stem_url=url))
            track.bpm, track.musical_key = bpm, key
            track.status, track.stage, track.error_message = TrackStatus.completed, "ready", None
            db.commit()
    except Exception as exc:
        db.rollback()
        track = db.get(Track, uuid.UUID(track_id))
        transient = isinstance(exc, (EndpointConnectionError, ConnectionClosedError, ReadTimeoutError))
        retrying = transient and self.request.retries < self.max_retries
        if track:
            track.status = TrackStatus.pending if retrying else TrackStatus.failed
            track.stage = "retrying" if retrying else "failed"
            track.error_message = "Processing failed. Retry the track; check worker logs if it persists."
            db.commit()
        if retrying:
            raise self.retry(exc=exc, countdown=10 * (self.request.retries + 1))
        raise
    finally:
        db.close()
