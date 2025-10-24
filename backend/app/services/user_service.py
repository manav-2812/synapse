"""User profile business logic."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user_schema import UserUpdateRequest


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = UserRepository(session)

    async def get_me(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        return user

    async def update_me(self, user_id: uuid.UUID, payload: UserUpdateRequest) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")

        if payload.full_name is not None:
            user.full_name = payload.full_name
        if payload.profile_image_url is not None:
            user.profile_image_url = payload.profile_image_url
        if payload.daily_study_goal_minutes is not None:
            user.daily_study_goal_minutes = payload.daily_study_goal_minutes

        # Credential / identity changes require the current password and
        # invalidate existing refresh tokens (session rotation).
        if payload.email is not None and payload.email != user.email:
            if not payload.current_password:
                raise ValidationError("Current password is required to change your email.")
            if not verify_password(payload.current_password, user.password_hash):
                raise ValidationError("Current password is incorrect.")
            if await self.repo.email_exists(payload.email):
                raise ValidationError("That email is already in use.")
            user.email = payload.email
            await self._rotate_sessions(user)

        if payload.new_password:
            if not payload.current_password:
                raise ValidationError("Current password is required to set a new password.")
            if not verify_password(payload.current_password, user.password_hash):
                raise ValidationError("Current password is incorrect.")
            user.password_hash = hash_password(payload.new_password)
            await self._rotate_sessions(user)

        profile = user.profile
        if profile is None:
            profile = await self._ensure_profile(user_id)
        if payload.education_level is not None:
            profile.education_level = payload.education_level
        if payload.institution is not None:
            profile.institution = payload.institution
        if payload.preferences is not None:
            if not isinstance(payload.preferences, dict):
                raise ValidationError("preferences must be an object.")
            profile.preferences = payload.preferences

        return await self.repo.update(user)

    async def _rotate_sessions(self, user: User) -> None:
        """Invalidate all existing refresh tokens (single-use rotation)."""
        user.last_refresh_jti = None

    async def set_avatar(self, user_id: uuid.UUID, profile_image_url: str) -> User:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found.")
        user.profile_image_url = profile_image_url
        return await self.repo.update(user)

    async def _ensure_profile(self, user_id: uuid.UUID) -> "UserProfile":  # noqa: F821
        from app.models.user_profile import UserProfile

        profile = UserProfile(user_id=user_id)
        return await self.repo.create_profile(profile)

