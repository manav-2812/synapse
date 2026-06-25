"""initial auth + profile + analytics schema

Revision ID: 0001_initial_auth
Revises:
Create Date: 2026-07-18
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0001_initial_auth"
down_revision: str | None = None
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("profile_image_url", sa.String(1024), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_refresh_jti", sa.String(64), nullable=True),
        sa.Index("ix_users_email", "email"),
        sa.Index("ix_users_last_refresh_jti", "last_refresh_jti"),
    )

    op.create_table(
        "user_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("education_level", sa.String(80), nullable=True),
        sa.Column("institution", sa.String(160), nullable=True),
        sa.Column("preferences", JSONB(), nullable=True, server_default=sa.text("'{}'::jsonb")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "analytics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("total_study_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("documents_uploaded_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("questions_asked_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("quizzes_taken_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("average_quiz_score", sa.Float(), nullable=False, server_default=sa.text("0.0")),
        sa.Column("weak_topics", JSONB(), nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.Column("strong_topics", JSONB(), nullable=True, server_default=sa.text("'[]'::jsonb")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("analytics")
    op.drop_table("user_profiles")
    op.drop_table("users")
