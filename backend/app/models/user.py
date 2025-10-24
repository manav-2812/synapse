"""User account model."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Single-use refresh token rotation: holds the jti of the currently valid refresh token.
    last_refresh_jti: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Daily study-goal target in minutes (editable in the profile/settings UI).
    daily_study_goal_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)

    # Relationships
    profile: Mapped["UserProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    analytics: Mapped["Analytics | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"


# Imported here to satisfy type-checking / relationship references
from app.models.user_profile import UserProfile  # noqa: E402
from app.models.analytics import Analytics  # noqa: E402
