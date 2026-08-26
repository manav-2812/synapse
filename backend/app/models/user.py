"""User account model."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Email verification status (required before standard password login).
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Single-use verification token rotation: holds the jti of the latest verification token.
    verification_token_jti: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Single-use refresh token rotation: holds the jti of the currently valid refresh token.
    last_refresh_jti: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Single-use password-reset token rotation: holds the jti of the active reset token.
    reset_token_jti: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Brute-force protection: consecutive failed login attempts (reset on success).
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Account locked until this UTC timestamp (None = not locked).
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Daily study-goal target in minutes (editable in the profile/settings UI).
    daily_study_goal_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # Relationships
    profile: Mapped["UserProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    analytics: Mapped["Analytics | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    passkeys: Mapped[list["UserPasskey"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# Imported here to satisfy type-checking / relationship references
from app.models.user_profile import UserProfile  # noqa: E402
from app.models.analytics import Analytics  # noqa: E402
from app.models.passkey import UserPasskey  # noqa: E402
