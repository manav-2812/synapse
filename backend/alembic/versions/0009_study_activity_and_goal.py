"""Add study_activity table and users.daily_study_goal_minutes

Revision ID: 0009_study_activity_and_goal
Revises: 0008_llm_usage_logs
Create Date: 2026-07-20
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0009_study_activity_and_goal"
down_revision = "0008_llm_usage_logs"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "study_activity",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("sessions", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_unique_constraint(
        "uq_study_activity_user_date", "study_activity", ["user_id", "date"]
    )
    op.add_column(
        "users",
        sa.Column(
            "daily_study_goal_minutes",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("30"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "daily_study_goal_minutes")
    op.drop_constraint("uq_study_activity_user_date", "study_activity", type_="unique")
    op.drop_table("study_activity")
