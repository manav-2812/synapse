"""Add email verification, security lockouts, reset tokens, and passkey challenges.

Revision ID: 0012_user_email_verification
Revises: 0011_user_passkeys
Create Date: 2026-08-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "0012_user_email_verification"
down_revision = "0011_user_passkeys"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Existing accounts remain verified by default so existing users are not blocked
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("verification_token_jti", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_users_verification_token_jti",
        "users",
        ["verification_token_jti"],
        unique=False,
    )
    op.add_column(
        "users",
        sa.Column("reset_token_jti", sa.String(64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("failed_login_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.add_column(
        "users",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )

    # Passkey challenges table for multi-instance / restart resilience
    op.create_table(
        "passkey_challenges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("challenge_b64", sa.String(256), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("passkey_challenges")
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")
    op.drop_column("users", "reset_token_jti")
    op.drop_index("ix_users_verification_token_jti", table_name="users")
    op.drop_column("users", "verification_token_jti")
    op.drop_column("users", "is_verified")
