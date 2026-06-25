"""Per-user study analytics aggregate."""
import uuid

from sqlalchemy import Float, Integer, Uuid, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Analytics(Base, TimestampMixin):
    __tablename__ = "analytics"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    total_study_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    documents_uploaded_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    questions_asked_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quizzes_taken_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_quiz_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    weak_topics: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    strong_topics: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    user: Mapped["User"] = relationship(back_populates="analytics")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Analytics {self.user_id}>"
