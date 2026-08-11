import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.database import get_db
from app.models import MixProject, Track, User
from app.schemas import MixProjectCreate, MixProjectOut, MixProjectUpdate

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=MixProjectOut)
def create_project(
    payload: MixProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids)).all()
    if len(tracks) != len(payload.track_ids):
        raise HTTPException(status_code=404, detail="One or more track_ids not found")

    composition_data = {
        "tracks": [
            {
                "track_id": str(track.id),
                "stems": {stem.stem_type.value: {"active": True, "volume": 1.0, "pitch_shift": 0} for stem in track.stems},
                "offset_seconds": 0,
            }
            for track in tracks
        ]
    }

    master_bpm = tracks[0].bpm if tracks else None

    project = MixProject(
        user_id=user.id,
        title=payload.title,
        master_bpm=master_bpm,
        composition_data=composition_data,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=MixProjectOut)
def get_project(project_id: uuid.UUID, db: Session = Depends(get_db)):
    project = db.query(MixProject).filter(MixProject.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
def update_project(project_id: uuid.UUID, payload: MixProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(MixProject).filter(MixProject.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    db.add(project)
    db.commit()
    return {"success": True}
