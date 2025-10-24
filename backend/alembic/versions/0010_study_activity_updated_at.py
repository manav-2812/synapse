"""Add missing updated_at column to study_activity

The study_activity model inherits TimestampMixin, which declares an
updated_at column, but migration 0009 created the table without it. This
brings the schema in line with the model (and the rest of the tables).

Revision ID: 0010_study_activity_updated_at
Revises: 0009_study_activity_and_goal
Create Date: 2026-07-20
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0010_study_activity_updated_at"
down_revision = "0009_study_activity_and_goal"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "study_activity",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("study_activity", "updated_at")
