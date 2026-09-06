from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://dissecttune:dissecttune@localhost:5432/dissecttune"
    redis_url: str = "redis://localhost:6379/0"

    # Object storage (S3 / Cloudflare R2 compatible)
    s3_endpoint_url: str | None = None
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket_name: str = "dissecttune"
    s3_region: str = "auto"
    s3_public_base_url: str = "http://localhost:9000/dissecttune"
    # Used by the worker to fetch objects over the internal Docker network;
    # falls back to s3_public_base_url when unset (e.g. non-Docker local dev).
    s3_internal_base_url: str | None = None

    # Feature flags
    use_real_demucs: bool = False
    demucs_model: str = "htdemucs_ft"

    cors_origins: list[str] = ["http://localhost:3000"]
    max_upload_mb: int = 50
    max_duration_seconds: int = 300
    max_project_tracks: int = 4
    auth_secret: str = "local-development-only-change-before-hosting"
    auth_token_hours: int = 168


settings = Settings()
