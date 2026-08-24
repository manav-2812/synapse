"""Database operations for UserPasskey."""
import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.passkey import UserPasskey


class PasskeyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, passkey: UserPasskey) -> UserPasskey:
        self.session.add(passkey)
        await self.session.flush()
        return passkey

    async def get_by_credential_id(self, credential_id: str) -> UserPasskey | None:
        stmt = (
            select(UserPasskey)
            .options(selectinload(UserPasskey.user))
            .where(UserPasskey.credential_id == credential_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: uuid.UUID) -> Sequence[UserPasskey]:
        stmt = (
            select(UserPasskey)
            .where(UserPasskey.user_id == user_id)
            .order_by(UserPasskey.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def delete_for_user(self, passkey_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = (
            delete(UserPasskey)
            .where(UserPasskey.id == passkey_id, UserPasskey.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        return result.rowcount > 0

    async def update_usage(self, passkey: UserPasskey, new_sign_count: int) -> None:
        passkey.sign_count = new_sign_count
        passkey.last_used_at = datetime.now(timezone.utc)
        await self.session.flush()
