"""User routes: read/update current user profile + avatar upload."""
import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.schemas.user_schema import (
    UserMeResponse,
    UserUpdateRequest,
    UserUpdateResponse,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/api/v1/users", tags=["users"])

ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/webp"}
ALLOWED_AVATAR_EXT = {".png", ".jpg", ".jpeg", ".webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get("/me", response_model=UserMeResponse)
async def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserUpdateResponse)
async def update_me(
    payload: UserUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    service = UserService(session)
    user = await service.update_me(current_user.id, payload)
    await session.commit()
    return user


@router.post("/me/avatar", response_model=UserUpdateResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    content_type = (file.content_type or "").lower()
    ext = (file.filename or "").lower()
    # Validate by declared type and extension (best-effort; no heavy deps).
    if content_type not in ALLOWED_AVATAR_TYPES and not any(
        ext.endswith(e) for e in ALLOWED_AVATAR_EXT
    ):
        raise ValidationError("Avatar must be a PNG, JPEG, or WebP image.")
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise ValidationError("Avatar image must be 5 MB or smaller.")

    from pathlib import Path

    suffix = ".jpg"
    if ext.endswith(".png"):
        suffix = ".png"
    elif ext.endswith(".webp"):
        suffix = ".webp"
    elif content_type == "image/png":
        suffix = ".png"
    elif content_type == "image/webp":
        suffix = ".webp"

    avatars_dir = Path(settings.avatars_path)
    avatars_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{suffix}"
    (avatars_dir / name).write_bytes(data)

    service = UserService(session)
    user = await service.set_avatar(current_user.id, f"{settings.app_base_url}/avatars/{name}")
    await session.commit()
    return user
