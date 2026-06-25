"""Study-tool models: generated notes, quizzes, questions, flashcards."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.ai.study.sm2 import DEFAULT_EASE_FACTOR
from app.core.constants import Difficulty, NoteType, QuestionType
from app.models.base import Base, TimestampMixin


class GeneratedNote(Base, TimestampMixin):
    __tablename__ = "generated_notes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    note_type: Mapped[NoteType] = mapped_column(Enum(NoteType, native_enum=False), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    document_scope: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    def __repr__(self) -> str:
        return f"<GeneratedNote {self.note_type}:{self.id}>"


class Quiz(Base, TimestampMixin):
    __tablename__ = "quizzes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, native_enum=False), nullable=False)
    score: Mapped[float | None] = mapped_column(nullable=True)
    document_scope: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="Question.order_index"
    )

    def __repr__(self) -> str:
        return f"<Quiz {self.title}:{self.id}>"


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    quiz_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, native_enum=False), nullable=False
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    quiz: Mapped["Quiz"] = relationship(back_populates="questions")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Question {self.id}>"


class Flashcard(Base, TimestampMixin):
    __tablename__ = "flashcards"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)

    # SM-2 spaced-repetition scheduling state.
    ease_factor: Mapped[float] = mapped_column(Float, nullable=False, default=DEFAULT_EASE_FACTOR)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Flashcard {self.id}>"
