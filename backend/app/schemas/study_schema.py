"""Pydantic schemas for study tools (notes, quizzes, flashcards)."""
from datetime import datetime

from pydantic import BaseModel, Field


# --- Requests ---
class GenerateNoteRequest(BaseModel):
    note_type: str = Field(description="short_notes | long_notes | exam_answer | formula_sheet")
    document_scope: list[str] | None = None


class GenerateQuizRequest(BaseModel):
    difficulty: str = Field(default="medium", description="easy | medium | hard")
    question_count: int = Field(default=5, ge=1, le=20)
    document_scope: list[str] | None = None


class GenerateFlashcardsRequest(BaseModel):
    count: int = Field(default=8, ge=1, le=30)
    document_scope: list[str] | None = None


class SubmitQuizRequest(BaseModel):
    quiz_id: str
    answers: list[str] = Field(description="Chosen answer per question, in order.")


# --- Responses ---
class NoteResponse(BaseModel):
    id: str
    note_type: str
    title: str
    content: str
    document_scope: list | None = []
    created_at: datetime


class QuestionResponse(BaseModel):
    id: str
    question_type: str
    prompt: str
    options: list | None = []
    correct_answer: str
    explanation: str | None = None


class QuizResponse(BaseModel):
    id: str
    title: str
    difficulty: str
    document_scope: list | None = []
    questions: list[QuestionResponse]
    created_at: datetime


class QuizResultItem(BaseModel):
    question_id: str
    prompt: str
    chosen: str | None
    correct_answer: str
    correct: bool
    explanation: str | None = None


class QuizResultResponse(BaseModel):
    quiz_id: str
    total: int
    correct: int
    score: float
    items: list[QuizResultItem]


class FlashcardResponse(BaseModel):
    id: str
    document_id: str | None = None
    front: str
    back: str
    created_at: datetime
    # SM-2 scheduling state.
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0
    due_date: datetime | None = None
    last_reviewed_at: datetime | None = None
    is_due: bool = False


class ReviewFlashcardRequest(BaseModel):
    quality: int = Field(ge=0, le=5, description="SM-2 recall quality: 0=blackout … 5=perfect")


class NoteUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None


class QuizUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)


class FlashcardUpdateRequest(BaseModel):
    front: str | None = Field(default=None, min_length=1)
    back: str | None = Field(default=None, min_length=1)
