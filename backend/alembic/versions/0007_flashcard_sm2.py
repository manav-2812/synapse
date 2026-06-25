"""Add SM-2 spaced-repetition columns to flashcards

Revision ID: 0007_flashcard_sm2
Revises: 0006_eval_runs
Create Date: 2026-07-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0007_flashcard_sm2"
down_revision = "0006_eval_runs"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "flashcards",
        sa.Column("ease_factor", sa.Float(), nullable=False, server_default=sa.text("2.5")),
    )
    op.add_column(
        "flashcards",
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "flashcards",
        sa.Column("repetitions", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "flashcards",
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "flashcards",
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_flashcards_due_date", "flashcards", ["due_date"])


def downgrade() -> None:
    op.drop_index("ix_flashcards_due_date", table_name="flashcards")
    op.drop_column("flashcards", "last_reviewed_at")
    op.drop_column("flashcards", "due_date")
    op.drop_column("flashcards", "repetitions")
    op.drop_column("flashcards", "interval_days")
    op.drop_column("flashcards", "ease_factor")
