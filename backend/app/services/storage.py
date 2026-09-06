"""Private object storage. Database URL columns hold keys for new uploads."""
from urllib.parse import unquote, urlparse
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from app.config import settings


def get_s3_client():
    return boto3.client("s3", endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", connect_timeout=10, read_timeout=60))


def ensure_bucket():
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket_name)
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in ("404", "NoSuchBucket"):
            raise
        try:
            client.create_bucket(Bucket=settings.s3_bucket_name)
        except ClientError as create_exc:
            if create_exc.response["Error"]["Code"] != "BucketAlreadyOwnedByYou":
                raise


def object_key(value: str) -> str:
    if value.startswith(("http://", "https://")):
        path = unquote(urlparse(value).path).lstrip("/")
        prefix = settings.s3_bucket_name + "/"
        return path[len(prefix):] if path.startswith(prefix) else path
    return value


def upload_fileobj(fileobj, key, content_type=None):
    get_s3_client().upload_fileobj(fileobj, settings.s3_bucket_name, key,
        ExtraArgs={"ContentType": content_type or "application/octet-stream"})
    return key


def upload_file(path, key, content_type=None):
    with open(path, "rb") as source:
        return upload_fileobj(source, key, content_type)


def download_to_path(key, dest_path):
    get_s3_client().download_file(settings.s3_bucket_name, object_key(key), dest_path)


def build_key(*parts):
    return "/".join(parts)
