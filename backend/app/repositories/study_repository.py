"""Repository for generated notes, quizzes, and flashcards."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.study import Flashcard, GeneratedNote, Question, Quiz


class StudyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # --- Notes ---
    async def create_note(self, note: GeneratedNote) -> GeneratedNote:
        self.session.add(note)
        await self.session.flush()
        return note

    async def list_notes(self, user_id: UUID) -> list[GeneratedNote]:
        res = await self.session.execute(
            select(GeneratedNote)
            .where(GeneratedNote.user_id == user_id)
            .order_by(GeneratedNote.created_at.desc())
        )
        return list(res.scalars().all())

    async def get_note(self, note_id: UUID, user_id: UUID) -> GeneratedNote | None:
        res = await self.session.execute(
            select(GeneratedNote).where(
                GeneratedNote.id == note_id, GeneratedNote.user_id == user_id
            )
        )
        return res.scalar_one_or_none()

    async def delete_note(self, note: GeneratedNote) -> None:
        await self.session.delete(note)
        await self.session.flush()

    async def update_note(
        self, note: GeneratedNote, title: str | None, content: str | None
    ) -> GeneratedNote:
        if title is not None:
            note.title = title[:255]
        if content is not None:
            note.content = content
        await self.session.flush()
        await self.session.refresh(note)
        return note

    # --- Quizzes ---
    async def create_quiz(self, quiz: Quiz) -> Quiz:
        self.session.add(quiz)
        await self.session.flush()
        return quiz

    async def list_quizzes(self, user_id: UUID) -> list[Quiz]:
        res = await self.session.execute(
            select(Quiz)
            .options(selectinload(Quiz.questions))
            .where(Quiz.user_id == user_id)
            .order_by(Quiz.created_at.desc())
        )
        return list(res.scalars().all())

    async def get_quiz(self, quiz_id: UUID, user_id: UUID) -> Quiz | None:
        res = await self.session.execute(
            select(Quiz)
            .options(selectinload(Quiz.questions))
            .where(Quiz.id == quiz_id, Quiz.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def delete_quiz(self, quiz: Quiz) -> None:
        await self.session.delete(quiz)
        await self.session.flush()

    async def update_quiz(self, quiz: Quiz, title: str | None) -> Quiz:
        if title is not None:
            quiz.title = title[:255]
        await self.session.flush()
        await self.session.refresh(quiz)
        return quiz

    # --- Flashcards ---
    async def bulk_create_flashcards(self, cards: list[Flashcard]) -> list[Flashcard]:
        self.session.add_all(cards)
        await self.session.flush()
        return cards

    async def list_flashcards(self, user_id: UUID) -> list[Flashcard]:
        res = await self.session.execute(
            select(Flashcard)
            .where(Flashcard.user_id == user_id)
            .order_by(Flashcard.created_at.desc())
        )
        return list(res.scalars().all())

    async def delete_flashcard(self, card: Flashcard) -> None:
        await self.session.delete(card)
        await self.session.flush()

    async def update_flashcard(
        self, card: Flashcard, front: str | None, back: str | None
    ) -> Flashcard:
        if front is not None:
            card.front = front
        if back is not None:
            card.back = back
        await self.session.flush()
        await self.session.refresh(card)
        return card
