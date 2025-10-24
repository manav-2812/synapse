"""Quiz scoring tests (no LLM dependency)."""
import uuid

from app.models.study import Question, Quiz
from app.repositories.study_repository import StudyRepository
from app.services.study_service import StudyService


async def test_quiz_scoring_all_correct(session, registered_user):
    user_id = uuid.UUID(registered_user["user_id"])
    repo = StudyRepository(session)
    quiz = Quiz(user_id=user_id, title="T", difficulty="easy", document_scope=[])
    await repo.create_quiz(quiz)
    q1 = Question(quiz_id=quiz.id, question_type="mcq", prompt="p1",
                  options=["a", "b"], correct_answer="a", order_index=0)
    q2 = Question(quiz_id=quiz.id, question_type="short_answer", prompt="p2",
                  options=[], correct_answer="Paris", order_index=1)
    session.add_all([q1, q2])
    await session.flush()

    svc = StudyService(session)
    result = await svc.submit_quiz(user_id, str(quiz.id), ["a", "Paris"])
    assert result["total"] == 2
    assert result["correct"] == 2
    assert result["score"] == 1.0
    assert all(it["correct"] for it in result["items"])


async def test_quiz_scoring_all_wrong(session, registered_user):
    user_id = uuid.UUID(registered_user["user_id"])
    repo = StudyRepository(session)
    quiz = Quiz(user_id=user_id, title="T2", difficulty="hard", document_scope=[])
    await repo.create_quiz(quiz)
    q1 = Question(quiz_id=quiz.id, question_type="mcq", prompt="p1",
                  options=["a", "b"], correct_answer="a", order_index=0)
    session.add(q1)
    await session.flush()

    svc = StudyService(session)
    result = await svc.submit_quiz(user_id, str(quiz.id), ["b"])
    assert result["correct"] == 0
    assert result["score"] == 0.0
    assert result["items"][0]["correct"] is False
    assert result["items"][0]["correct_answer"] == "a"


async def test_quiz_scoring_records_analytics(session, registered_user):
    user_id = uuid.UUID(registered_user["user_id"])
    repo = StudyRepository(session)
    quiz = Quiz(user_id=user_id, title="T3", difficulty="medium", document_scope=[])
    await repo.create_quiz(quiz)
    q1 = Question(quiz_id=quiz.id, question_type="mcq", prompt="p",
                  options=["a", "b"], correct_answer="a", order_index=0)
    session.add(q1)
    await session.flush()

    svc = StudyService(session)
    await svc.submit_quiz(user_id, str(quiz.id), ["a"])

    from app.repositories.user_repository import UserRepository

    analytics = await UserRepository(session).get_analytics(user_id)
    assert analytics.quizzes_taken_count == 1
    assert analytics.average_quiz_score == 1.0


async def test_submit_unknown_quiz_raises(session, registered_user):
    from app.core.exceptions import NotFoundError

    svc = StudyService(session)
    try:
        await svc.submit_quiz(uuid.UUID(registered_user["user_id"]), str(uuid.uuid4()), ["x"])
        assert False, "expected NotFoundError"
    except NotFoundError:
        pass
