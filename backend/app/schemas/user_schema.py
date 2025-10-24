"""Pydantic schemas for user endpoints."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_serializer, model_validator


class UserProfileSchema(BaseModel):
    education_level: str | None = None
    institution: str | None = None
    preferences: dict = Field(default_factory=dict)

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _default_prefs(cls, data):
        # ORM may store NULL preferences; coerce to empty dict.
        if not isinstance(data, dict):
            return {
                "education_level": getattr(data, "education_level", None),
                "institution": getattr(data, "institution", None),
                "preferences": getattr(data, "preferences", None) or {},
            }
        return data


class UserMeResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    profile_image_url: str | None = None
    is_active: bool
    profile: UserProfileSchema | None = None
    daily_study_goal_minutes: int = 30
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce_orm(cls, data):
        # Pydantic v2 reads ORM attributes directly (bypassing field validators),
        # so coerce nested ORM objects to plain dicts/schemas here first.
        if not isinstance(data, dict):
            profile = getattr(data, "profile", None)
            if profile is not None and not isinstance(profile, UserProfileSchema):
                profile = UserProfileSchema.model_validate(profile)
            data = {
                "id": str(getattr(data, "id")),
                "email": getattr(data, "email"),
                "full_name": getattr(data, "full_name"),
                "profile_image_url": getattr(data, "profile_image_url", None),
                "is_active": getattr(data, "is_active"),
                "profile": profile,
                "daily_study_goal_minutes": getattr(data, "daily_study_goal_minutes", 30),
                "created_at": getattr(data, "created_at"),
            }
        return data

    @field_serializer("id")
    def _id_str(self, v: str) -> str:
        return str(v)


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=160)
    profile_image_url: str | None = Field(default=None, max_length=1024)
    education_level: str | None = None
    institution: str | None = None
    preferences: dict | None = None
    daily_study_goal_minutes: int | None = None
    # Account changes (require re-authentication via current_password).
    email: EmailStr | None = None
    current_password: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateResponse(UserMeResponse):
    """PATCH /me response — same shape as GET /me."""
