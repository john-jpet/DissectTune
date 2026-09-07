import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.models import StemType, TrackStatus


class StemOut(BaseModel):
    id: uuid.UUID
    stem_type: StemType
    stem_url: str


class TrackUploadResponse(BaseModel):
    track_id: uuid.UUID
    status: TrackStatus


class TrackStatusResponse(BaseModel):
    track_id: uuid.UUID
    status: TrackStatus
    stage: str
    retryable: bool = False
    duration: float | None = None
    bpm: float | None = None
    key: str | None = None
    original_filename: str
    error_message: str | None = None
    stems: list[StemOut] = Field(default_factory=list)


class StemSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    active: bool = True
    solo: bool = False
    volume: float = Field(default=1, ge=0, le=1, allow_inf_nan=False)


class CompositionTrack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    track_id: uuid.UUID
    offset_seconds: float = Field(default=0, ge=0, le=300, allow_inf_nan=False)
    stems: dict[StemType, StemSettings] = Field(default_factory=dict)


class Composition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tracks: list[CompositionTrack] = Field(default_factory=list, max_length=4)
    master_volume: float = Field(default=0.8, ge=0, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def unique_tracks(self):
        ids = [track.track_id for track in self.tracks]
        if len(ids) != len(set(ids)):
            raise ValueError("A track can only appear once in a project")
        return self


class MixProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    track_ids: list[uuid.UUID] = Field(default_factory=list, max_length=4)


class MixProjectUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    master_bpm: float | None = Field(default=None, ge=20, le=400, allow_inf_nan=False)
    composition_data: Composition


class MixProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    master_bpm: float | None
    composition_data: dict
    updated_at: datetime
