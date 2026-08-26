"""Security helpers: password hashing and JWT access/refresh tokens."""
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"
RESET_TOKEN_TYPE = "reset"
VERIFICATION_TOKEN_TYPE = "verify_email"



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


def create_reset_token(email: str, token_id: str | None = None) -> str:
    """Short-lived, single-use token for password reset (15 minutes).

    A jti (JWT ID) is embedded so the service layer can invalidate it on
    first use — preventing replay within the 15-minute expiry window.
    """
    jti = token_id or uuid.uuid4().hex
    return _create_token(
        subject=email,
        token_type=RESET_TOKEN_TYPE,
        expires_delta=timedelta(minutes=15),
        extra_claims={"jti": jti},
    )


def create_verification_token(email: str, token_id: str | None = None, expire_hours: int = 24) -> str:
    """Token for email verification upon signup (24 hours)."""
    claims = {"jti": token_id} if token_id else None
    return _create_token(
        subject=email,
        token_type=VERIFICATION_TOKEN_TYPE,
        expires_delta=timedelta(hours=expire_hours),
        extra_claims=claims,
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def validate_password_bytes(password: str) -> None:
    """Raise ValueError if the password exceeds bcrypt's 72-byte limit.

    bcrypt silently truncates input at 72 bytes, meaning two passwords that
    share the same 72-byte prefix are considered identical.  We surface a
    clear error rather than accepting a password that only partially matches
    what the user typed.
    """
    if len(password.encode("utf-8")) > 72:
        raise ValueError(
            "Password must be 72 characters or fewer (bcrypt limit). "
            "Please choose a shorter password."
        )


__all__ = [
    "hash_password",
    "verify_password",
    "validate_password_bytes",
    "create_access_token",
    "create_refresh_token",
    "create_reset_token",
    "create_verification_token",
    "decode_token",
    "ACCESS_TOKEN_TYPE",
    "REFRESH_TOKEN_TYPE",
    "RESET_TOKEN_TYPE",
    "VERIFICATION_TOKEN_TYPE",
]

