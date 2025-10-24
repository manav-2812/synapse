"""User profile (education level, institution, preferences)."""
import uuid

from sqlalchemy import String, Uuid, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserProfile(Base, TimestampMixin):
    __tablename__ = "user_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    education_level: Mapped[str | None] = mapped_column(String(80), nullable=True)
    institution: Mapped[str | None] = mapped_column(String(160), nullable=True)
    preferences: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821

    def __repr__(self) -> str:
        return f"<UserProfile {self.user_id}>"
