"""Folder orchestration."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.folder import Folder
from app.repositories.document_repository import FolderRepository
from app.schemas.document_schema import FolderCreateRequest


class FolderService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = FolderRepository(session)

    async def create(self, payload: FolderCreateRequest, user_id: uuid.UUID) -> Folder:
        if payload.parent_folder_id is not None:
            parent = await self.repo.get_owned(uuid.UUID(payload.parent_folder_id), user_id)
            if parent is None:
                raise ValidationError("Invalid parent folder.")
        folder = Folder(user_id=user_id, name=payload.name, parent_folder_id=payload.parent_folder_id)
        return await self.repo.create(folder)

    async def list_folders(self, user_id: uuid.UUID) -> list[Folder]:
        return await self.repo.list_by_user(user_id)

    async def delete(self, folder_id: uuid.UUID, user_id: uuid.UUID) -> None:
        folder = await self.repo.get_owned(folder_id, user_id)
        if folder is None:
            raise NotFoundError("Folder not found.")
        await self.repo.delete(folder)
        await self.session.commit()
