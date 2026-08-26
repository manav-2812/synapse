"""Add is_verified and verification_token_jti to users table.

Revision ID: 0012_user_email_verification
Revises: 0011_user_passkeys
Create Date: 2026-08-26
"""
import sqlalchemy as sa
from alembic import op

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


def downgrade() -> None:
    op.drop_index("ix_users_verification_token_jti", table_name="users")
    op.drop_column("users", "verification_token_jti")
    op.drop_column("users", "is_verified")
