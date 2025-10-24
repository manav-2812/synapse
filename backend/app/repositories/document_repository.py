"""Document + folder repository — all queries scoped by user_id."""
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.folder import Folder


class DocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, document: Document) -> Document:
        self.session.add(document)
        await self.session.flush()
        return document

    async def list_by_user(self, user_id: UUID, folder_id: UUID | None = None) -> list[Document]:
        stmt = select(Document).where(Document.user_id == user_id)
        if folder_id is not None:
            stmt = stmt.where(Document.folder_id == folder_id)
        stmt = stmt.order_by(Document.created_at.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_owned(self, document_id: UUID, user_id: UUID) -> Document | None:
        res = await self.session.execute(
            select(Document).where(Document.id == document_id, Document.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def update(self, document: Document) -> Document:
        await self.session.flush()
        await self.session.refresh(document)
        return document

    async def delete(self, document: Document) -> None:
        await self.session.delete(document)
        await self.session.flush()

    async def chunk_count(self, document_id: UUID) -> int:
        res = await self.session.execute(
            select(func.count()).select_from(DocumentChunk).where(DocumentChunk.document_id == document_id)
        )
        return int(res.scalar() or 0)


class FolderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, folder: Folder) -> Folder:
        self.session.add(folder)
        await self.session.flush()
        return folder

    async def list_by_user(self, user_id: UUID) -> list[Folder]:
        res = await self.session.execute(
            select(Folder)
            .where(Folder.user_id == user_id)
            .order_by(Folder.name.asc())
        )
        return list(res.scalars().all())

    async def get_owned(self, folder_id: UUID, user_id: UUID) -> Folder | None:
        res = await self.session.execute(
            select(Folder).where(Folder.id == folder_id, Folder.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def delete(self, folder: Folder) -> None:
        await self.session.delete(folder)
        await self.session.flush()
