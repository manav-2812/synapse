"""Document orchestration: upload, status, delete (with Chroma + disk cleanup)."""
import os
import uuid

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.vectorstore import chroma_client
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logger import get_logger
from app.models.document import Document
from app.models.folder import Folder
from app.repositories.chunk_repository import ChunkRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.user_repository import UserRepository
from app.services.processing_service import process_document
from app.services.upload_service import save_upload, validate_upload

log = get_logger("document")


class DocumentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = DocumentRepository(session)

    async def upload(
        self, file: UploadFile, user_id: uuid.UUID, folder_id: uuid.UUID | None, background
    ) -> Document:
        if folder_id is not None:
            folder = await self.session.get(Folder, folder_id)
            if folder is None or folder.user_id != user_id:
                raise ValidationError("Invalid folder.")

        ext = validate_upload(file)
        doc = Document(
            user_id=user_id,
            folder_id=folder_id,
            filename="",  # set after we know the id
            original_filename=file.filename or "upload",
            file_type=ext,
            file_size_bytes=0,
            storage_path="",
            processing_status="pending",
        )
        self.session.add(doc)
        await self.session.flush()  # assigns doc.id

        storage_path, filename, size = await save_upload(file, user_id, doc.id)
        doc.filename = filename
        doc.storage_path = storage_path
        doc.file_size_bytes = size
        await self.session.commit()

        await UserRepository(self.session).increment_documents_uploaded(user_id)
        await self.session.commit()

        if background is not None:
            background.add_task(process_document, str(doc.id))
        return doc

    async def list_documents(self, user_id: uuid.UUID, folder_id: uuid.UUID | None) -> list[Document]:
        return await self.repo.list_by_user(user_id, folder_id)

    async def get_document(self, document_id: uuid.UUID, user_id: uuid.UUID) -> Document:
        doc = await self.repo.get_owned(document_id, user_id)
        if doc is None:
            raise NotFoundError("Document not found.")
        return doc

    async def get_status(self, document_id: uuid.UUID, user_id: uuid.UUID) -> dict:
        doc = await self.get_document(document_id, user_id)
        chunk_count = await ChunkRepository(self.session).count_by_document(doc.id)
        return {"document": doc, "chunk_count": chunk_count}

    async def update_document(
        self, document_id: uuid.UUID, user_id: uuid.UUID, folder_id: uuid.UUID | None, original_filename: str | None
    ) -> Document:
        doc = await self.get_document(document_id, user_id)
        if folder_id is not None:
            folder = await self.session.get(Folder, folder_id)
            if folder is None or folder.user_id != user_id:
                raise ValidationError("Invalid folder.")
            doc.folder_id = folder_id
        if original_filename is not None:
            doc.original_filename = original_filename
        return await self.repo.update(doc)

    async def delete_document(self, document_id: uuid.UUID, user_id: uuid.UUID) -> None:
        doc = await self.get_document(document_id, user_id)
        chunk_repo = ChunkRepository(self.session)
        chunks = await chunk_repo.list_by_document(doc.id)
        ids = [c.chroma_vector_id for c in chunks if c.chroma_vector_id]
        try:
            await chroma_client.delete_chunks(str(user_id), ids)
        except Exception as e:
            log.warning("chroma_delete_failed", document_id=str(doc.id), error=str(e))
        if doc.storage_path and os.path.exists(doc.storage_path):
            try:
                os.remove(doc.storage_path)
            except OSError as e:
                log.warning("file_delete_failed", path=doc.storage_path, error=str(e))
        await self.repo.delete(doc)
        await self.session.commit()
