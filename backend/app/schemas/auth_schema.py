"""Pydantic schemas for auth endpoints with certified domain validation."""
import re
import unicodedata

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.email_validator import validate_signup_email
from app.core.security import validate_password_bytes


def _sanitise_full_name(value: str) -> str:
    """NFC-normalise, strip leading/trailing whitespace, and remove control characters."""
    normalised = unicodedata.normalize("NFC", value).strip()
    # Strip ASCII control characters and Unicode categories Cc (control) / Cf (format)
    cleaned = "".join(
        ch for ch in normalised
        if unicodedata.category(ch) not in ("Cc", "Cf") and not (ord(ch) < 32)
    )
    if not cleaned:
        raise ValueError("Full name must contain visible characters.")
    return cleaned


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)

    @field_validator("email")
    @classmethod
    def validate_domain(cls, v: EmailStr) -> str:
        return validate_signup_email(v, check_mx=True)

    @field_validator("password")
    @classmethod
    def validate_password_length_bytes(cls, v: str) -> str:
        validate_password_bytes(v)
        return v

    @field_validator("full_name")
    @classmethod
    def sanitise_name(cls, v: str) -> str:
        return _sanitise_full_name(v)


class SignupResponse(BaseModel):
    message: str
    email: str
    is_verified: bool
    # dev_verify_link intentionally removed -- links are now written to server
    # logs only and never returned in HTTP response bodies.


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def validate_domain(cls, v: EmailStr) -> str:
        # check_mx=False: avoids a live DNS lookup whose timing difference would
        # reveal whether a given email domain exists (account enumeration oracle).
        return validate_signup_email(v, check_mx=False)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def validate_domain(cls, v: EmailStr) -> str:
        return validate_signup_email(v, check_mx=False)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class GoogleOAuthRequest(BaseModel):
    code: str | None = None
    redirect_uri: str | None = None
    credential: str | None = None


class MicrosoftOAuthRequest(BaseModel):
    code: str | None = None
    access_token: str | None = None
    redirect_uri: str | None = None
    code_verifier: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def validate_domain(cls, v: EmailStr) -> str:
        return validate_signup_email(v, check_mx=False)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_length_bytes(cls, v: str) -> str:
        validate_password_bytes(v)
        return v
