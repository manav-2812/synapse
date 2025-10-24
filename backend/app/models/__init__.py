"""Model registry — import all models so metadata is populated."""
from app.models.analytics import Analytics
from app.models.conversation import AnswerSource, Conversation, Message
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.eval_run import EvalRun
from app.models.folder import Folder
from app.models.llm_usage_log import LLMUsageLog
from app.models.study import Flashcard, GeneratedNote, Question, Quiz
from app.models.study_activity import StudyActivity
from app.models.user import User
from app.models.user_profile import UserProfile

__all__ = [
    "User",
    "UserProfile",
    "Analytics",
    "Folder",
    "Document",
    "DocumentChunk",
    "EvalRun",
    "LLMUsageLog",
    "StudyActivity",
    "Conversation",
    "Message",
    "AnswerSource",
    "GeneratedNote",
    "Quiz",
    "Question",
    "Flashcard",
]
