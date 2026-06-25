"""Add eval runs table

Revision ID: 0006_eval_runs
Revises: 0005_quiz_score
Create Date: 2026-07-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0006_eval_runs"
down_revision = "0005_quiz_score"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "eval_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("aggregate_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("raw_results", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("eval_runs")