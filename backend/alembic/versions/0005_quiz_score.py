"""Add score column to quizzes

Revision ID: 0005_quiz_score
Revises: 0004_study_tools
Create Date: 2026-07-18
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_quiz_score"
down_revision: str = "0004_study_tools"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("quizzes", sa.Column("score", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("quizzes", "score")
