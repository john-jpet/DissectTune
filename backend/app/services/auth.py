"""Salted password hashes and expiring, signed bearer tokens."""
import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from fastapi import HTTPException
from app.config import settings


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"{salt}:{digest}"


def check_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    salt, digest = encoded.split(":")
    actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, digest)


def issue_token(user_id: uuid.UUID) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": str(user_id), "exp": int(time.time()) + settings.auth_token_hours * 3600,
    }).encode()).decode()
    signature = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def read_token(token: str) -> uuid.UUID:
    try:
        payload, signature = token.split(".")
        expected = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(payload))
        if data["exp"] <= time.time():
            raise ValueError()
        return uuid.UUID(data["sub"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Session expired or invalid") from None
