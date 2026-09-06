from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, projects, tracks

app = FastAPI(title="DissectTune API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracks.router)
app.include_router(projects.router)
app.include_router(auth.router)


@app.get("/api/config")
def client_config():
    return {"separation_mode": "demucs" if settings.use_real_demucs else "demo",
            "max_upload_mb": settings.max_upload_mb,
            "max_duration_seconds": settings.max_duration_seconds,
            "max_project_tracks": settings.max_project_tracks}


@app.get("/health")
def health():
    return {"status": "ok"}
