"""Pydantic schemas for WebAuthn Passkeys."""
import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class PasskeyOptionsResponse(BaseModel):
    challenge_id: str
    options: dict[str, Any]


class PasskeyRegisterVerifyRequest(BaseModel):
    challenge_id: str
    credential: dict[str, Any]
    name: str = Field(default="Device Passkey", max_length=120)


class PasskeyLoginVerifyRequest(BaseModel):
    challenge_id: str
    credential: dict[str, Any]


class PasskeyItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    last_used_at: datetime | None = None

    model_config = {"from_attributes": True}
