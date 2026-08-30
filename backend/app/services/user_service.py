"""User profile business logic."""
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import get_logger
from app.core.security import hash_password, verify_password
from app.models.analytics import Analytics
from app.models.conversation import AnswerSource, Conversation, Message
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.folder import Folder
from app.models.study import Flashcard, GeneratedNote, Question, Quiz
from app.models.study_activity import StudyActivity
from app.models.user import User
from app.models.user_profile import UserProfile
from app.repositories.user_repository import UserRepository
from app.schemas.user_schema import UserUpdateRequest

log = get_logger("user.service")


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def get_me(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user

    async def update_me(self, user_id: uuid.UUID, payload: UserUpdateRequest) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        if payload.full_name is not None:
            user.full_name = payload.full_name
        if payload.profile_image_url is not None:
            user.profile_image_url = payload.profile_image_url
        if payload.daily_study_goal_minutes is not None:
            user.daily_study_goal_minutes = payload.daily_study_goal_minutes

        # Credential / identity changes require the current password and
        # invalidate existing refresh tokens (session rotation).
        if payload.email is not None and payload.email != user.email:
            if not payload.current_password:
                raise ValidationError("Current password is required to change your email.")
            if not verify_password(payload.current_password, user.password_hash):
                raise ValidationError("Current password is incorrect.")
            if await self.repo.email_exists(payload.email):
                raise ValidationError("That email is already in use.")
            user.email = payload.email
            await self._rotate_sessions(user)

        if payload.new_password:
            if not payload.current_password:
                raise ValidationError("Current password is required to set a new password.")
            if not verify_password(payload.current_password, user.password_hash):
                raise ValidationError("Current password is incorrect.")
            user.password_hash = hash_password(payload.new_password)
            await self._rotate_sessions(user)

        profile = user.profile
        if profile is None:
            profile = await self._ensure_profile(user_id)
        if payload.education_level is not None:
            profile.education_level = payload.education_level
        if payload.institution is not None:
            profile.institution = payload.institution
        if payload.preferences is not None:
            if not isinstance(payload.preferences, dict):
                raise ValidationError("preferences must be an object.")
            profile.preferences = payload.preferences

        return await self.repo.update(user)

    async def _rotate_sessions(self, user: User) -> None:
        """Invalidate all existing refresh tokens (single-use rotation)."""
        user.last_refresh_jti = None

    async def set_avatar(self, user_id: uuid.UUID, profile_image_url: str) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        user.profile_image_url = profile_image_url
        return await self.repo.update(user)

    async def _ensure_profile(self, user_id: uuid.UUID) -> UserProfile:
        profile = UserProfile(user_id=user_id)
        return await self.repo.create_profile(profile)

    async def export_data(self, user_id: uuid.UUID) -> dict:
        """Generate a complete GDPR / CCPA compliant JSON workspace export."""
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        # Profile & Analytics
        profile_data = None
        if user.profile:
            profile_data = {
                "education_level": user.profile.education_level,
                "institution": user.profile.institution,
                "preferences": user.profile.preferences,
            }
        analytics_data = None
        if user.analytics:
            analytics_data = {
                "total_study_minutes": user.analytics.total_study_minutes,
                "documents_uploaded_count": user.analytics.documents_uploaded_count,
                "questions_asked_count": user.analytics.questions_asked_count,
                "quizzes_taken_count": user.analytics.quizzes_taken_count,
                "average_quiz_score": user.analytics.average_quiz_score,
                "weak_topics": user.analytics.weak_topics,
                "strong_topics": user.analytics.strong_topics,
            }

        # Folders
        folders_res = await self.session.execute(select(Folder).where(Folder.user_id == user_id))
        folders = [
            {
                "id": str(f.id),
                "name": f.name,
                "parent_folder_id": str(f.parent_folder_id) if f.parent_folder_id else None,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in folders_res.scalars().all()
        ]

        # Documents
        docs_res = await self.session.execute(
            select(Document).where(Document.user_id == user_id).options(selectinload(Document.chunks))
        )
        documents = [
            {
                "id": str(d.id),
                "folder_id": str(d.folder_id) if d.folder_id else None,
                "filename": d.filename,
                "original_filename": d.original_filename,
                "file_type": d.file_type.value if hasattr(d.file_type, "value") else str(d.file_type),
                "file_size_bytes": d.file_size_bytes,
                "processing_status": d.processing_status.value if hasattr(d.processing_status, "value") else str(d.processing_status),
                "page_count": d.page_count,
                "chunk_count": len(d.chunks) if d.chunks else 0,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs_res.scalars().all()
        ]

        # Conversations + Messages + Sources
        convs_res = await self.session.execute(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .options(selectinload(Conversation.messages).selectinload(Message.sources))
        )
        conversations = []
        for c in convs_res.scalars().all():
            messages = []
            for m in (c.messages or []):
                sources = [
                    {
                        "document_id": str(s.document_id) if s.document_id else None,
                        "chunk_text": s.chunk_text,
                        "page_number": s.page_number,
                        "score": s.score,
                    }
                    for s in (m.sources or [])
                ]
                messages.append({
                    "id": str(m.id),
                    "role": m.role.value if hasattr(m.role, "value") else str(m.role),
                    "content": m.content,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                    "sources": sources,
                })
            conversations.append({
                "id": str(c.id),
                "title": c.title,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "messages": messages,
            })

        # Study Notes
        notes_res = await self.session.execute(select(GeneratedNote).where(GeneratedNote.user_id == user_id))
        notes = [
            {
                "id": str(n.id),
                "note_type": n.note_type.value if hasattr(n.note_type, "value") else str(n.note_type),
                "title": n.title,
                "content": n.content,
                "document_scope": [str(d) for d in (n.document_scope or [])],
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notes_res.scalars().all()
        ]

        # Quizzes
        quizzes_res = await self.session.execute(
            select(Quiz).where(Quiz.user_id == user_id).options(selectinload(Quiz.questions))
        )
        quizzes = []
        for q in quizzes_res.scalars().all():
            questions = [
                {
                    "id": str(qn.id),
                    "question_type": qn.question_type.value if hasattr(qn.question_type, "value") else str(qn.question_type),
                    "prompt": qn.prompt,
                    "options": qn.options,
                    "correct_answer": qn.correct_answer,
                    "explanation": qn.explanation,
                    "order_index": qn.order_index,
                }
                for qn in (q.questions or [])
            ]
            quizzes.append({
                "id": str(q.id),
                "title": q.title,
                "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
                "score": q.score,
                "document_scope": [str(d) for d in (q.document_scope or [])],
                "created_at": q.created_at.isoformat() if q.created_at else None,
                "questions": questions,
            })

        # Flashcards
        cards_res = await self.session.execute(select(Flashcard).where(Flashcard.user_id == user_id))
        flashcards = [
            {
                "id": str(fc.id),
                "document_id": str(fc.document_id) if fc.document_id else None,
                "front": fc.front,
                "back": fc.back,
                "ease_factor": fc.ease_factor,
                "interval_days": fc.interval_days,
                "repetitions": fc.repetitions,
                "due_date": fc.due_date.isoformat() if fc.due_date else None,
                "last_reviewed_at": fc.last_reviewed_at.isoformat() if fc.last_reviewed_at else None,
                "created_at": fc.created_at.isoformat() if fc.created_at else None,
            }
            for fc in cards_res.scalars().all()
        ]

        # Study Activities
        acts_res = await self.session.execute(select(StudyActivity).where(StudyActivity.user_id == user_id))
        activities = [
            {
                "id": str(act.id),
                "date": act.date.isoformat() if hasattr(act.date, "isoformat") else str(act.date),
                "minutes": act.minutes,
                "sessions": act.sessions,
            }
            for act in acts_res.scalars().all()
        ]

        return {
            "format": "synapse-gdpr-export-v1",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "user": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "profile_image_url": user.profile_image_url,
                "is_verified": user.is_verified,
                "daily_study_goal_minutes": user.daily_study_goal_minutes,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            },
            "profile": profile_data,
            "analytics": analytics_data,
            "folders": folders,
            "documents": documents,
            "conversations": conversations,
            "study_notes": notes,
            "quizzes": quizzes,
            "flashcards": flashcards,
            "study_activities": activities,
        }

    async def delete_account(self, user_id: uuid.UUID) -> None:
        """Permanently erase a user account and all associated physical and DB data (Right to Erasure)."""
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        # 1. Physical document file cleanup
        docs_res = await self.session.execute(select(Document).where(Document.user_id == user_id))
        docs = docs_res.scalars().all()
        for d in docs:
            if d.storage_path:
                try:
                    p = Path(d.storage_path)
                    if p.is_file():
                        p.unlink(missing_ok=True)
                except Exception as e:
                    log.warning("delete_doc_file_error", document_id=str(d.id), error=str(e))

        # 2. Physical avatar cleanup
        if user.profile_image_url and "/avatars/" in user.profile_image_url:
            try:
                avatar_name = user.profile_image_url.split("/avatars/")[-1]
                avatar_p = Path(settings.avatars_path) / avatar_name
                if avatar_p.is_file():
                    avatar_p.unlink(missing_ok=True)
            except Exception as e:
                log.warning("delete_avatar_file_error", user_id=str(user_id), error=str(e))

        # 3. ChromaDB & BM25 cleanup
        try:
            from app.ai.vectorstore import chroma_client
            await chroma_client.delete_collection(str(user_id))
        except Exception as e:
            log.warning("delete_chroma_collection_error", user_id=str(user_id), error=str(e))

        try:
            from app.ai.rag.bm25 import invalidate
            invalidate(str(user_id))
        except Exception as e:
            log.warning("invalidate_bm25_error", user_id=str(user_id), error=str(e))

        # 4. Database cleanup
        doc_ids = [d.id for d in docs]
        if doc_ids:
            await self.session.execute(delete(DocumentChunk).where(DocumentChunk.document_id.in_(doc_ids)))
        await self.session.execute(delete(Document).where(Document.user_id == user_id))
        await self.session.execute(delete(Folder).where(Folder.user_id == user_id))

        conv_ids_res = await self.session.execute(select(Conversation.id).where(Conversation.user_id == user_id))
        conv_ids = conv_ids_res.scalars().all()
        if conv_ids:
            msg_ids_res = await self.session.execute(select(Message.id).where(Message.conversation_id.in_(conv_ids)))
            msg_ids = msg_ids_res.scalars().all()
            if msg_ids:
                await self.session.execute(delete(AnswerSource).where(AnswerSource.message_id.in_(msg_ids)))
                await self.session.execute(delete(Message).where(Message.id.in_(msg_ids)))
            await self.session.execute(delete(Conversation).where(Conversation.id.in_(conv_ids)))

        quiz_ids_res = await self.session.execute(select(Quiz.id).where(Quiz.user_id == user_id))
        quiz_ids = quiz_ids_res.scalars().all()
        if quiz_ids:
            await self.session.execute(delete(Question).where(Question.quiz_id.in_(quiz_ids)))
            await self.session.execute(delete(Quiz).where(Quiz.id.in_(quiz_ids)))

        await self.session.execute(delete(GeneratedNote).where(GeneratedNote.user_id == user_id))
        await self.session.execute(delete(Flashcard).where(Flashcard.user_id == user_id))
        await self.session.execute(delete(StudyActivity).where(StudyActivity.user_id == user_id))

        try:
            from app.models.llm_usage_log import LLMUsageLog
            await self.session.execute(delete(LLMUsageLog).where(LLMUsageLog.user_id == user_id))
        except Exception:
            pass

        try:
            from app.models.passkey import UserPasskey
            from app.models.passkey_challenge import PasskeyChallenge
            await self.session.execute(delete(PasskeyChallenge).where(PasskeyChallenge.user_id == user_id))
            await self.session.execute(delete(UserPasskey).where(UserPasskey.user_id == user_id))
        except Exception:
            pass

        try:
            from app.models.eval_run import EvalRun
            await self.session.execute(delete(EvalRun).where(EvalRun.user_id == user_id))
        except Exception:
            pass

        await self.session.execute(delete(UserProfile).where(UserProfile.user_id == user_id))
        await self.session.execute(delete(Analytics).where(Analytics.user_id == user_id))
        await self.session.execute(delete(User).where(User.id == user_id))


