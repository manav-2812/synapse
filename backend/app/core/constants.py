"""Shared enums and constants used across models and schemas."""
import enum


class FileType(str, enum.Enum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    IMAGE = "image"


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class NoteType(str, enum.Enum):
    SHORT_NOTES = "short_notes"
    LONG_NOTES = "long_notes"
    EXAM_ANSWER = "exam_answer"
    FORMULA_SHEET = "formula_sheet"


class Difficulty(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuestionType(str, enum.Enum):
    MCQ = "mcq"
    SHORT_ANSWER = "short_answer"
