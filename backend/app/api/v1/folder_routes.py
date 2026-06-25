"""Folder routes: create, list, delete."""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.schemas.document_schema import (
    FolderCreateRequest,
    FolderResponse,
)
from app.services.folder_service import FolderService

router = APIRouter(prefix="/api/v1/documents/folders", tags=["folders"])


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: FolderCreateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = FolderService(session)
    folder = await svc.create(payload, current_user.id)
    await session.commit()
    return folder


@router.get("", response_model=list[FolderResponse])
async def list_folders(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = FolderService(session)
    return await svc.list_folders(current_user.id)


@router.delete("/{folder_id}", status_code=status.HTTP_200_OK)
async def delete_folder(
    folder_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = FolderService(session)
    await svc.delete(uuid.UUID(folder_id), current_user.id)
    return {"message": "Folder deleted."}
