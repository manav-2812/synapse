"""Study-activity repository — per-day study-minute upsert + range queries."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.study_activity import StudyActivity


class StudyActivityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record_minutes(
        self, user_id: uuid.UUID, minutes: int, when: date | None = None
    ) -> None:
        """Add ``minutes`` to the user's study-activity row for day ``when``.

        Inserts a new row or, if one already exists for that UTC day, increments
        its ``minutes``/``sessions`` counters. ``flush`` only — the caller commits.
        """
        day = when or datetime.now(timezone.utc).date()
        stmt = insert(StudyActivity).values(
            user_id=user_id, date=day, minutes=minutes, sessions=1
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={
                "minutes": StudyActivity.minutes + stmt.excluded.minutes,
                "sessions": StudyActivity.sessions + 1,
            },
        )
        await self.session.execute(stmt)
        await self.session.flush()

    async def get_since(self, user_id: uuid.UUID, since: date) -> list[StudyActivity]:
        """Return all activity rows for the user on or after ``since``."""
        res = await self.session.execute(
            select(StudyActivity)
            .where(StudyActivity.user_id == user_id, StudyActivity.date >= since)
            .order_by(StudyActivity.date.asc())
        )
        return list(res.scalars().all())
