import uuid

import boto3
from botocore.client import Config

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4"),
    )


def ensure_bucket() -> None:
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket_name)
    except Exception:
        client.create_bucket(Bucket=settings.s3_bucket_name)


def upload_fileobj(fileobj, key: str, content_type: str | None = None) -> str:
    client = get_s3_client()
    extra_args = {"ContentType": content_type} if content_type else {}
    client.upload_fileobj(fileobj, settings.s3_bucket_name, key, ExtraArgs=extra_args)
    return f"{settings.s3_public_base_url}/{key}"


def upload_file(path: str, key: str, content_type: str | None = None) -> str:
    client = get_s3_client()
    extra_args = {"ContentType": content_type} if content_type else {}
    client.upload_file(path, settings.s3_bucket_name, key, ExtraArgs=extra_args)
    return f"{settings.s3_public_base_url}/{key}"


def download_to_path(key: str, dest_path: str) -> None:
    client = get_s3_client()
    client.download_file(settings.s3_bucket_name, key, dest_path)


def build_key(*parts: str) -> str:
    return "/".join(parts)


def new_object_id() -> str:
    return str(uuid.uuid4())
