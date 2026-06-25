"""Per-user daily study-activity aggregate (minutes studied per UTC day)."""
import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class StudyActivity(Base, TimestampMixin):
    __tablename__ = "study_activity"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)  # UTC day
    minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<StudyActivity {self.user_id} {self.date}: {self.minutes}m>"
