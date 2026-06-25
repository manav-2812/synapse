"""Study-tool orchestration: generate notes/quizzes/flashcards, score quizzes."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_query
from app.ai.rag import retrieve
from app.ai.study import generate_json
from app.ai.study.prompts import (
    build_flashcards_prompt,
    build_note_prompt,
    build_quiz_prompt,
)
from app.core.constants import Difficulty, NoteType, QuestionType
from app.core.exceptions import NotFoundError, ProcessingError, ValidationError
from app.core.logger import get_logger
from app.models.study import Flashcard, GeneratedNote, Question, Quiz
from app.repositories.study_activity_repository import StudyActivityRepository
from app.repositories.study_repository import StudyRepository
from app.repositories.user_repository import UserRepository

log = get_logger("study")

GEN_TOP_K = 8


def _validate_enum(value: str, enum_cls, field: str):
    try:
        return enum_cls(value.lower())
    except ValueError:
        raise ValidationError(
            f"Invalid {field} '{value}'. Allowed: {[e.value for e in enum_cls]}"
        )


class StudyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = StudyRepository(session)

    async def _context(self, user_id: uuid.UUID, scope: list[str] | None) -> list[dict]:
        qvec = await embed_query(_scope_query(scope))
        return await retrieve(qvec, str(user_id), top_k=GEN_TOP_K, document_scope=scope)

    async def _generate_json(self, system: str, user: str):
        """Generate study content and parse its JSON, raising a clean error.

        The LLM response is occasionally truncated or malformed. We retry with
        a stricter "JSON only" instruction and rely on :func:`generate_json`'s
        cross-provider fallback so a single bad Groq output is retried on
        Gemini instead of failing outright.
        """
        prompts = [
            system,
            system + "\nRespond with valid JSON only — no markdown fences, no commentary before or after.",
        ]
        last_err: Exception | None = None
        for sys in prompts:
            try:
                return await generate_json(sys, user)
            except ProcessingError as e:
                last_err = e
                continue
        raise last_err or ProcessingError(
            "The AI model returned an unparseable response. Please try again."
        )

    async def generate_note(self, user_id: uuid.UUID, note_type: str, scope: list[str] | None):
        ntype = _validate_enum(note_type, NoteType, "note_type")
        chunks = await self._context(user_id, scope)
        system, user = build_note_prompt(ntype.value, chunks)
        data = await self._generate_json(system, user)
        note = GeneratedNote(
            user_id=user_id,
            note_type=ntype,
            title=str(data.get("title", "Generated Notes"))[:255],
            content=str(data.get("content", "")),
            document_scope=scope or [],
        )
        return await self.repo.create_note(note)

    async def generate_quiz(
        self, user_id: uuid.UUID, difficulty: str, count: int, scope: list[str] | None
    ):
        diff = _validate_enum(difficulty, Difficulty, "difficulty")
        chunks = await self._context(user_id, scope)
        system, user = build_quiz_prompt(diff.value, count, chunks)
        items = await self._generate_json(system, user)
        if not isinstance(items, list) or not items:
            raise ValidationError("Model did not return any quiz questions.")

        quiz = Quiz(user_id=user_id, title=f"{diff.value.title()} Quiz", difficulty=diff, document_scope=scope or [])
        await self.repo.create_quiz(quiz)
        for i, item in enumerate(items):
            q = Question(
                quiz_id=quiz.id,
                question_type=_validate_enum(
                    str(item.get("question_type", "short_answer")), QuestionType, "question_type"
                ),
                prompt=str(item.get("prompt", "")),
                options=list(item.get("options") or []),
                correct_answer=str(item.get("correct_answer", "")),
                explanation=item.get("explanation"),
                order_index=i,
            )
            self.session.add(q)
        await self.session.flush()
        # Eager-load the relationship so the route can serialize without a lazy (sync) load.
        await self.session.refresh(quiz, ["questions"])
        return quiz

    async def generate_flashcards(self, user_id: uuid.UUID, count: int, scope: list[str] | None):
        chunks = await self._context(user_id, scope)
        system, user = build_flashcards_prompt(count, chunks)
        items = await self._generate_json(system, user)
        if not isinstance(items, list) or not items:
            raise ValidationError("Model did not return any flashcards.")
        doc_id = uuid.UUID(scope[0]) if scope else None
        from app.ai.study.sm2 import DEFAULT_EASE_FACTOR, due_date_from

        cards = [
            Flashcard(
                user_id=user_id,
                document_id=doc_id,
                front=str(item.get("front", "")),
                back=str(item.get("back", "")),
                ease_factor=DEFAULT_EASE_FACTOR,
                interval_days=0,
                repetitions=0,
                due_date=due_date_from(0),  # new cards are immediately due
            )
            for item in items
        ]
        return await self.repo.bulk_create_flashcards(cards)

    # --- Spaced repetition (SM-2) ---
    async def get_due_flashcards(self, user_id: uuid.UUID, limit: int = 50):
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.models.study import Flashcard

        now = datetime.now(timezone.utc)
        res = await self.session.execute(
            select(Flashcard)
            .where(
                Flashcard.user_id == user_id,
                (Flashcard.due_date.is_(None)) | (Flashcard.due_date <= now),
            )
            .order_by(Flashcard.due_date.asc().nulls_first())
            .limit(limit)
        )
        return list(res.scalars().all())

    async def review_flashcard(self, user_id: uuid.UUID, card_id: str, quality: int):
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.ai.study import sm2
        from app.models.study import Flashcard

        res = await self.session.execute(
            select(Flashcard).where(Flashcard.id == uuid.UUID(card_id), Flashcard.user_id == user_id)
        )
        card = res.scalar_one_or_none()
        if card is None:
            raise NotFoundError("Flashcard not found.")

        now = datetime.now(timezone.utc)
        ef, interval, reps = sm2.update(
            card.ease_factor, card.interval_days, card.repetitions, quality
        )
        card.ease_factor = ef
        card.interval_days = interval
        card.repetitions = reps
        card.last_reviewed_at = now
        card.due_date = sm2.due_date_from(interval, now)

        # A single flashcard review counts as ~1 minute of study time.
        await StudyActivityRepository(self.session).record_minutes(user_id, 1)
        await self.session.flush()
        await self.session.refresh(card)
        return card

    # --- Quiz scoring ---
    async def submit_quiz(self, user_id: uuid.UUID, quiz_id: str, answers: list[str]):
        quiz = await self.repo.get_quiz(uuid.UUID(quiz_id), user_id)
        if quiz is None:
            raise NotFoundError("Quiz not found.")
        questions = quiz.questions
        if len(answers) != len(questions):
            raise ValidationError(
                f"Expected {len(questions)} answers, got {len(answers)}."
            )
        items = []
        correct = 0
        for q, chosen in zip(questions, answers):
            is_correct = _answers_match(chosen, q.correct_answer)
            correct += 1 if is_correct else 0
            items.append(
                {
                    "question_id": str(q.id),
                    "prompt": q.prompt,
                    "chosen": chosen,
                    "correct_answer": q.correct_answer,
                    "correct": is_correct,
                    "explanation": q.explanation,
                }
            )
        total = len(questions)
        score = (correct / total) if total else 0.0
        quiz.score = score
        await UserRepository(self.session).record_quiz_score(user_id, score)
        # Estimate study time from quiz length (~1 min per question, min 2).
        await StudyActivityRepository(self.session).record_minutes(user_id, max(2, total))
        await self.session.commit()
        return {
            "quiz_id": str(quiz.id),
            "total": total,
            "correct": correct,
            "score": score,
            "items": items,
        }

    # --- Lists / reads ---
    async def list_notes(self, user_id: uuid.UUID):
        return await self.repo.list_notes(user_id)

    async def list_quizzes(self, user_id: uuid.UUID):
        return await self.repo.list_quizzes(user_id)

    async def get_quiz(self, quiz_id: str, user_id: uuid.UUID):
        quiz = await self.repo.get_quiz(uuid.UUID(quiz_id), user_id)
        if quiz is None:
            raise NotFoundError("Quiz not found.")
        return quiz

    async def list_flashcards(self, user_id: uuid.UUID):
        return await self.repo.list_flashcards(user_id)

    async def delete_note(self, note_id: str, user_id: uuid.UUID) -> None:
        note = await self.repo.get_note(uuid.UUID(note_id), user_id)
        if note is None:
            raise NotFoundError("Note not found.")
        await self.repo.delete_note(note)
        await self.session.commit()

    async def update_note(
        self, note_id: str, user_id: uuid.UUID, title: str | None, content: str | None
    ) -> GeneratedNote:
        note = await self.repo.get_note(uuid.UUID(note_id), user_id)
        if note is None:
            raise NotFoundError("Note not found.")
        return await self.repo.update_note(note, title, content)

    async def delete_quiz(self, quiz_id: str, user_id: uuid.UUID) -> None:
        quiz = await self.repo.get_quiz(uuid.UUID(quiz_id), user_id)
        if quiz is None:
            raise NotFoundError("Quiz not found.")
        await self.repo.delete_quiz(quiz)
        await self.session.commit()

    async def update_quiz(self, quiz_id: str, user_id: uuid.UUID, title: str | None) -> Quiz:
        quiz = await self.repo.get_quiz(uuid.UUID(quiz_id), user_id)
        if quiz is None:
            raise NotFoundError("Quiz not found.")
        return await self.repo.update_quiz(quiz, title)

    async def delete_flashcard(self, card_id: str, user_id: uuid.UUID) -> None:
        from sqlalchemy import select

        from app.models.study import Flashcard

        res = await self.session.execute(
            select(Flashcard).where(Flashcard.id == uuid.UUID(card_id), Flashcard.user_id == user_id)
        )
        card = res.scalar_one_or_none()
        if card is None:
            raise NotFoundError("Flashcard not found.")
        await self.repo.delete_flashcard(card)
        await self.session.commit()

    async def update_flashcard(
        self, card_id: str, user_id: uuid.UUID, front: str | None, back: str | None
    ) -> Flashcard:
        from sqlalchemy import select

        from app.models.study import Flashcard

        res = await self.session.execute(
            select(Flashcard).where(Flashcard.id == uuid.UUID(card_id), Flashcard.user_id == user_id)
        )
        card = res.scalar_one_or_none()
        if card is None:
            raise NotFoundError("Flashcard not found.")
        return await self.repo.update_flashcard(card, front, back)


def _scope_query(scope: list[str] | None) -> str:
    """A neutral query to seed retrieval when scope is given but no user question is."""
    if scope:
        return "key concepts, definitions, and facts from these documents"
    return "important topics to study"


def _answers_match(chosen: str | None, correct: str) -> bool:
    if chosen is None:
        return False
    return chosen.strip().lower() == correct.strip().lower()
