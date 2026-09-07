import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.config import settings
from app.deps import get_current_user
from app.database import get_db
from app.models import MixProject, Track, TrackStatus, User
from app.schemas import MixProjectCreate, MixProjectOut, MixProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


def owned_project(db, project_id, user):
    project = db.query(MixProject).filter(MixProject.id == project_id,
        MixProject.user_id == user.id).first()
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def owned_tracks(db, ids, user):
    if len(ids) != len(set(ids)) or len(ids) > settings.max_project_tracks:
        raise HTTPException(422, "Too many tracks or duplicate tracks")
    found = db.query(Track).filter(Track.id.in_(ids), Track.user_id == user.id,
        Track.status == TrackStatus.completed).all()
    by_id = {track.id: track for track in found}
    if any(track_id not in by_id for track_id in ids):
        raise HTTPException(422, "Tracks must belong to you and be fully processed")
    return [by_id[track_id] for track_id in ids]


@router.get("", response_model=list[MixProjectOut])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(MixProject).filter(MixProject.user_id == user.id).order_by(
        MixProject.updated_at.desc()).limit(100).all()


@router.post("", response_model=MixProjectOut, status_code=201)
def create_project(payload: MixProjectCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    tracks = owned_tracks(db, payload.track_ids, user)
    project = MixProject(user_id=user.id, title=payload.title,
        master_bpm=tracks[0].bpm if tracks else None,
        composition_data={"master_volume": 0.8, "tracks": [{
            "track_id": str(track.id), "offset_seconds": 0, "tempo_ratio": 1, "pitch_semitones": 0,
            "stems": {stem.stem_type.value: {"active": True, "solo": False, "volume": 1}
                      for stem in track.stems}} for track in tracks]})
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=MixProjectOut)
def get_project(project_id: uuid.UUID, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return owned_project(db, project_id, user)


@router.put("/{project_id}", response_model=MixProjectOut)
def update_project(project_id: uuid.UUID, payload: MixProjectUpdate,
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project = owned_project(db, project_id, user)
    tracks = owned_tracks(db, [item.track_id for item in payload.composition_data.tracks], user)
    for track, item in zip(tracks, payload.composition_data.tracks):
        if set(item.stems) != {stem.stem_type for stem in track.stems}:
            raise HTTPException(422, "Composition must include settings for every stem")
    project.title = payload.title
    project.master_bpm = payload.master_bpm
    project.composition_data = payload.composition_data.model_dump(mode="json")
    db.commit()
    db.refresh(project)
    return project
