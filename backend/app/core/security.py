"""Security helpers: password hashing and JWT access/refresh tokens."""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the plaintext password.

    Uses bcrypt directly (not passlib) — passlib 1.7.4 is unmaintained and
    emits a `(trapped) error reading bcrypt version` warning on every hash/
    verify against bcrypt 4.x because it reads the removed `bcrypt.__about__`.
    The output format is identical ($2b$…), so hashes produced here verify
    against any bcrypt implementation.
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Check a plaintext password against a bcrypt hash.

    Returns False (never raises) on malformed/expired hashes so a bad stored
    value can't crash a login attempt.
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _create_token(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    to_encode: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def create_access_token(user_id: str) -> str:
    """Short-lived access token."""
    return _create_token(
        subject=user_id,
        token_type=ACCESS_TOKEN_TYPE,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(user_id: str, token_id: str) -> str:
    """Long-lived refresh token carrying a rotation id (jti)."""
    return _create_token(
        subject=user_id,
        token_type=REFRESH_TOKEN_TYPE,
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        extra_claims={"jti": token_id},
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "ACCESS_TOKEN_TYPE",
    "REFRESH_TOKEN_TYPE",
]
