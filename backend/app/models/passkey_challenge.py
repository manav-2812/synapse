"""Passkey challenge model -- persists WebAuthn challenges in PostgreSQL.

Replaces the in-memory ChallengeStore, making challenges survive process
restarts and work correctly in multi-worker / multi-instance deployments.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PasskeyChallenge(Base):
    """Stores a pending WebAuthn challenge (registration or authentication).

    Each row is single-use: the repository deletes it on first read.
    Expired rows are cleaned up lazily on every read/write.
    """

    __tablename__ = "passkey_challenges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Base64URL-encoded raw challenge bytes
    challenge_b64: Mapped[str] = mapped_column(String(256), nullable=False)
    # NULL for authentication ceremonies (no user known yet)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<PasskeyChallenge {self.id} expires={self.expires_at}>"
