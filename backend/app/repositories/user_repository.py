"""User repository — DB queries only, ownership enforced by caller."""
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.analytics import Analytics


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_email(self, email: str) -> User | None:
        res = await self.session.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def get_by_id(self, user_id: UUID) -> User | None:
        res = await self.session.execute(
            select(User)
            .options(selectinload(User.profile), selectinload(User.analytics))
            .where(User.id == user_id)
        )
        return res.scalar_one_or_none()

    async def get_analytics(self, user_id: UUID) -> Analytics | None:
        res = await self.session.execute(select(Analytics).where(Analytics.user_id == user_id))
        return res.scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        res = await self.session.execute(select(User.id).where(User.email == email))
        return res.first() is not None

    async def create(self, user: User) -> User:
        self.session.add(user)
        await self.session.flush()
        return user

    async def create_profile(self, profile: UserProfile) -> UserProfile:
        self.session.add(profile)
        await self.session.flush()
        return profile

    async def create_analytics(self, analytics: Analytics) -> Analytics:
        self.session.add(analytics)
        await self.session.flush()
        return analytics

    async def update(self, user: User) -> User:
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def increment_documents_uploaded(self, user_id: UUID) -> None:
        """Bump the user's analytics documents_uploaded_count by one."""
        await self.session.execute(
            update(Analytics)
            .where(Analytics.user_id == user_id)
            .values(documents_uploaded_count=Analytics.documents_uploaded_count + 1)
        )
        await self.session.flush()

    async def increment_questions_asked(self, user_id: UUID) -> None:
        await self.session.execute(
            update(Analytics)
            .where(Analytics.user_id == user_id)
            .values(questions_asked_count=Analytics.questions_asked_count + 1)
        )
        await self.session.flush()

    async def record_quiz_score(self, user_id: UUID, score: float) -> None:
        """Increment quizzes_taken_count and update the running average score (0..1)."""
        res = await self.session.execute(
            select(Analytics.quizzes_taken_count, Analytics.average_quiz_score).where(
                Analytics.user_id == user_id
            )
        )
        row = res.first()
        n = (row[0] if row else 0) or 0
        prev_avg = (row[1] if row else 0.0) or 0.0
        new_avg = (prev_avg * n + float(score)) / (n + 1) if (n + 1) else float(score)
        await self.session.execute(
            update(Analytics)
            .where(Analytics.user_id == user_id)
            .values(
                quizzes_taken_count=Analytics.quizzes_taken_count + 1,
                average_quiz_score=new_avg,
            )
        )
        await self.session.flush()
