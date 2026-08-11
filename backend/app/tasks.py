import os
import tempfile
import urllib.request
import uuid

from app.celery_app import celery_app
from app.config import settings
from app.database import SessionLocal
from app.models import Stem, StemType, Track, TrackStatus
from app.services.analysis import analyze_bpm_and_key
from app.services.separation import separate_stems
from app.services.storage import build_key, upload_file


def _to_internal_url(public_url: str) -> str:
    """Rewrite a stored public object URL to the worker-reachable internal one."""
    if not settings.s3_internal_base_url:
        return public_url
    return public_url.replace(settings.s3_public_base_url, settings.s3_internal_base_url, 1)


@celery_app.task(name="app.tasks.process_track", bind=True, max_retries=2)
def process_track(self, track_id: str):
    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == uuid.UUID(track_id)).first()
        if track is None:
            return

        track.status = TrackStatus.processing
        db.add(track)
        db.commit()

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_input = os.path.join(tmp_dir, track.original_filename)
            urllib.request.urlretrieve(_to_internal_url(track.file_url), local_input)

            bpm, key = analyze_bpm_and_key(local_input)

            stem_paths = separate_stems(local_input)

            for stem_type_str, local_stem_path in stem_paths.items():
                key_path = build_key("stems", track_id, f"{stem_type_str}.wav")
                stem_url = upload_file(local_stem_path, key_path, content_type="audio/wav")

                stem = Stem(
                    track_id=track.id,
                    stem_type=StemType(stem_type_str),
                    stem_url=stem_url,
                )
                db.add(stem)

            track.bpm = bpm
            track.musical_key = key
            track.status = TrackStatus.completed
            db.add(track)
            db.commit()

    except Exception as exc:  # noqa: BLE001
        db.rollback()
        track = db.query(Track).filter(Track.id == uuid.UUID(track_id)).first()
        if track is not None:
            track.status = TrackStatus.failed
            track.error_message = str(exc)[:500]
            db.add(track)
            db.commit()
        raise
    finally:
        db.close()
