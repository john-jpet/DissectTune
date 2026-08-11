import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import StemType, TrackStatus


class StemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stem_type: StemType
    stem_url: str


class TrackUploadResponse(BaseModel):
    track_id: uuid.UUID
    status: TrackStatus


class TrackStatusResponse(BaseModel):
    track_id: uuid.UUID
    status: TrackStatus
    bpm: float | None = None
    key: str | None = None
    original_filename: str
    error_message: str | None = None
    stems: list[StemOut] = []


class MixProjectCreate(BaseModel):
    title: str
    track_ids: list[uuid.UUID]


class MixProjectUpdate(BaseModel):
    title: str | None = None
    master_bpm: float | None = None
    composition_data: dict | None = None


class MixProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    master_bpm: float | None
    composition_data: dict
    updated_at: datetime
