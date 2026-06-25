"""Study-tool routes: notes, quizzes, flashcards, quiz submission."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.schemas.study_schema import (
    FlashcardResponse,
    FlashcardUpdateRequest,
    GenerateFlashcardsRequest,
    GenerateNoteRequest,
    GenerateQuizRequest,
    NoteResponse,
    NoteUpdateRequest,
    QuizResponse,
    QuizResultResponse,
    QuizUpdateRequest,
    QuestionResponse,
    ReviewFlashcardRequest,
    SubmitQuizRequest,
)
from app.services.study_service import StudyService

router = APIRouter(prefix="/api/v1/study", tags=["study"])


def _flashcard_out(c, is_due: bool = False) -> FlashcardResponse:
    return FlashcardResponse(
        id=str(c.id),
        document_id=str(c.document_id) if c.document_id else None,
        front=c.front,
        back=c.back,
        created_at=c.created_at,
        ease_factor=c.ease_factor,
        interval_days=c.interval_days,
        repetitions=c.repetitions,
        due_date=c.due_date,
        last_reviewed_at=c.last_reviewed_at,
        is_due=is_due,
    )


def _note_out(n) -> NoteResponse:
    return NoteResponse(
        id=str(n.id),
        note_type=n.note_type.value if hasattr(n.note_type, "value") else n.note_type,
        title=n.title,
        content=n.content,
        document_scope=n.document_scope or [],
        created_at=n.created_at,
    )


def _question_out(q) -> QuestionResponse:
    return QuestionResponse(
        id=str(q.id),
        question_type=q.question_type.value if hasattr(q.question_type, "value") else q.question_type,
        prompt=q.prompt,
        options=q.options or [],
        correct_answer=q.correct_answer,
        explanation=q.explanation,
    )


def _quiz_out(q) -> QuizResponse:
    return QuizResponse(
        id=str(q.id),
        title=q.title,
        difficulty=q.difficulty.value if hasattr(q.difficulty, "value") else q.difficulty,
        document_scope=q.document_scope or [],
        questions=[_question_out(qq) for qq in q.questions],
        created_at=q.created_at,
    )


# --- Notes ---
@router.post("/notes", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def generate_note(
    payload: GenerateNoteRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    note = await svc.generate_note(current_user.id, payload.note_type, payload.document_scope)
    await session.commit()
    return _note_out(note)


@router.get("/notes", response_model=list[NoteResponse])
async def list_notes(current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    return [_note_out(n) for n in await StudyService(session).list_notes(current_user.id)]


@router.delete("/notes/{note_id}", status_code=status.HTTP_200_OK)
async def delete_note(
    note_id: str, current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    await StudyService(session).delete_note(note_id, current_user.id)
    return {"message": "Note deleted."}


@router.patch("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: str,
    payload: NoteUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    note = await StudyService(session).update_note(
        note_id, current_user.id, payload.title, payload.content
    )
    await session.commit()
    return _note_out(note)


# --- Quizzes ---
@router.post("/quiz", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def generate_quiz(
    payload: GenerateQuizRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    quiz = await svc.generate_quiz(
        current_user.id, payload.difficulty, payload.question_count, payload.document_scope
    )
    await session.commit()
    return _quiz_out(quiz)


@router.post("/quiz/submit", response_model=QuizResultResponse)
async def submit_quiz(
    payload: SubmitQuizRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    result = await svc.submit_quiz(current_user.id, payload.quiz_id, payload.answers)
    return result


@router.get("/quiz", response_model=list[QuizResponse])
async def list_quizzes(current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    svc = StudyService(session)
    return [_quiz_out(q) for q in await svc.list_quizzes(current_user.id)]


@router.get("/quiz/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: str, current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    return _quiz_out(await StudyService(session).get_quiz(quiz_id, current_user.id))


@router.delete("/quiz/{quiz_id}", status_code=status.HTTP_200_OK)
async def delete_quiz(
    quiz_id: str, current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    await StudyService(session).delete_quiz(quiz_id, current_user.id)
    return {"message": "Quiz deleted."}


@router.patch("/quiz/{quiz_id}", response_model=QuizResponse)
async def update_quiz(
    quiz_id: str,
    payload: QuizUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    quiz = await StudyService(session).update_quiz(quiz_id, current_user.id, payload.title)
    await session.commit()
    return _quiz_out(quiz)


# --- Flashcards ---
@router.post("/flashcards", response_model=list[FlashcardResponse], status_code=status.HTTP_201_CREATED)
async def generate_flashcards(
    payload: GenerateFlashcardsRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    cards = await svc.generate_flashcards(current_user.id, payload.count, payload.document_scope)
    await session.commit()
    return [_flashcard_out(c) for c in cards]


@router.get("/flashcards", response_model=list[FlashcardResponse])
async def list_flashcards(
    current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    svc = StudyService(session)
    now = datetime.now(timezone.utc)
    return [
        _flashcard_out(c, is_due=(c.due_date is None or c.due_date <= now))
        for c in await svc.list_flashcards(current_user.id)
    ]


@router.get("/flashcards/due", response_model=list[FlashcardResponse])
async def due_flashcards(
    limit: int = Query(50, ge=1, le=200),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    return [_flashcard_out(c, is_due=True) for c in await svc.get_due_flashcards(current_user.id, limit)]


@router.post("/flashcards/{card_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    card_id: str,
    payload: ReviewFlashcardRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = StudyService(session)
    card = await svc.review_flashcard(current_user.id, card_id, payload.quality)
    await session.commit()
    now = datetime.now(timezone.utc)
    return _flashcard_out(card, is_due=(card.due_date is None or card.due_date <= now))


@router.delete("/flashcards/{card_id}", status_code=status.HTTP_200_OK)
async def delete_flashcard(
    card_id: str, current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    await StudyService(session).delete_flashcard(card_id, current_user.id)
    return {"message": "Flashcard deleted."}


@router.patch("/flashcards/{card_id}", response_model=FlashcardResponse)
async def update_flashcard(
    card_id: str,
    payload: FlashcardUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    card = await StudyService(session).update_flashcard(
        card_id, current_user.id, payload.front, payload.back
    )
    await session.commit()
    now = datetime.now(timezone.utc)
    return _flashcard_out(card, is_due=(card.due_date is None or card.due_date <= now))
