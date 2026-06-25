"""Auth business logic: signup, login, refresh, logout."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError, ForbiddenError
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.analytics import Analytics
from app.models.user import User
from app.models.user_profile import UserProfile
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import LoginRequest, SignupRequest


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = UserRepository(session)

    async def signup(self, payload: SignupRequest) -> User:
        if await self.repo.email_exists(payload.email):
            raise ConflictError("An account with this email already exists.")
        user = User(
            email=payload.email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            is_active=True,
        )
        await self.repo.create(user)
        # Provision empty profile + analytics for every new user
        await self.repo.create_profile(UserProfile(user_id=user.id))
        await self.repo.create_analytics(Analytics(user_id=user.id))
        return user

    async def login(self, payload: LoginRequest) -> tuple[User, str, str]:
        user = await self.repo.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.password_hash):
            raise UnauthorizedError("Invalid email or password.")
        if not user.is_active:
            raise ForbiddenError("This account is disabled.")
        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def refresh(self, refresh_token: str) -> tuple[User, str, str]:
        try:
            claims = decode_token(refresh_token)
        except Exception:
            raise UnauthorizedError("Invalid refresh token.")
        if claims.get("type") != REFRESH_TOKEN_TYPE:
            raise UnauthorizedError("Invalid token type.")
        user_id = _to_uuid(claims.get("sub"))
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise UnauthorizedError("User no longer exists.")
        # Single-use: the presented jti must match the stored one
        if user.last_refresh_jti != claims.get("jti"):
            raise UnauthorizedError("Refresh token has been revoked or already used.")
        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        try:
            claims = decode_token(refresh_token)
        except Exception:
            return
        if claims.get("type") != REFRESH_TOKEN_TYPE:
            return
        user = await self.repo.get_by_id(_to_uuid(claims.get("sub")))
        if user and user.last_refresh_jti == claims.get("jti"):
            user.last_refresh_jti = None
            await self.repo.update(user)

    def _issue_tokens(self, user: User) -> tuple[str, str, str]:
        jti = uuid.uuid4().hex
        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id), jti)
        return access, refresh, jti


def _to_uuid(value: str | None) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise UnauthorizedError("Invalid token subject.")


# Re-export token type constants for route-layer convenience
__all__ = ["AuthService", "ACCESS_TOKEN_TYPE", "REFRESH_TOKEN_TYPE"]
