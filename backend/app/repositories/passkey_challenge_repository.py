"""DB-backed WebAuthn challenge repository -- single-use, TTL-aware."""
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.passkey_challenge import PasskeyChallenge


class PasskeyChallengeRepository:
    """CRUD for passkey challenge rows.

    Challenges are single-use: pop() deletes the row on first successful read.
    Expired rows are pruned lazily inside save() and pop().
    """

    TTL_SECONDS: int = 300  # 5 minutes

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save(
        self,
        challenge_b64: str,
        user_id: uuid.UUID | None = None,
    ) -> uuid.UUID:
        """Persist a challenge and return its UUID (used as challenge_id)."""
        await self._cleanup()
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.TTL_SECONDS)
        row = PasskeyChallenge(
            challenge_b64=challenge_b64,
            user_id=user_id,
            expires_at=expires_at,
        )
        self.session.add(row)
        await self.session.commit()
        return row.id

    async def pop(self, challenge_id: uuid.UUID) -> PasskeyChallenge | None:
        """Return and immediately delete the challenge row (single-use).

        Returns None if the challenge does not exist or has expired.
        """
        await self._cleanup()
        res = await self.session.execute(
            select(PasskeyChallenge).where(
                PasskeyChallenge.id == challenge_id,
                PasskeyChallenge.expires_at > datetime.now(timezone.utc),
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            return None
        await self.session.delete(row)
        await self.session.flush()
        return row

    async def _cleanup(self) -> None:
        """Delete all expired challenge rows."""
        await self.session.execute(
            delete(PasskeyChallenge).where(
                PasskeyChallenge.expires_at <= datetime.now(timezone.utc)
            )
        )
