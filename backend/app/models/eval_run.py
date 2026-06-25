"""Model for persisted retrieval-evaluation runs."""
import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    aggregate_scores: Mapped[dict] = mapped_column(JSON, nullable=False)
    raw_results: Mapped[dict] = mapped_column(JSON, nullable=False)
