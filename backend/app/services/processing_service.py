"""Background ingestion: extract -> clean -> chunk -> embed -> persist."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_texts
from app.ai.loaders import load_document
from app.ai.processing import chunker
from app.ai.vectorstore import chroma_client
from app.core.database import AsyncSessionLocal
from app.core.exceptions import ProcessingError
from app.core.logger import get_logger
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.repositories.chunk_repository import ChunkRepository
from app.repositories.document_repository import DocumentRepository

log = get_logger("processing")


async def process_document(document_id: str) -> None:
    """Full ingestion pipeline. Runs in a BackgroundTask with its own session."""
    async with AsyncSessionLocal() as session:
        repo = DocumentRepository(session)
        doc = await session.get(Document, uuid.UUID(document_id))
        if doc is None:
            log.warning("process_document_missing", document_id=document_id)
            return

        doc.processing_status = "processing"
        await session.flush()

        try:
            pages = await _extract(doc)
            chunks = chunker.chunk_document(pages)
            if not chunks:
                raise ProcessingError("No extractable text found in the document.")

            ids = [str(uuid.uuid4()) for _ in chunks]
            texts = [c["text"] for c in chunks]
            metas = [
                {
                    "document_id": str(doc.id),
                    "chunk_id": ids[i],
                    "page_number": c["page_number"],
                }
                for i, c in enumerate(chunks)
            ]
            embeddings = await embed_texts(texts)

            await chroma_client.add_chunks(
                user_id=str(doc.user_id),
                chunk_ids=ids,
                texts=texts,
                embeddings=embeddings,
                metadatas=metas,
            )

            chunk_rows = [
                DocumentChunk(
                    document_id=doc.id,
                    chunk_text=c["text"],
                    page_number=c["page_number"],
                    chunk_index=c["chunk_index"],
                    token_count=c["token_count"],
                    chroma_vector_id=ids[i],
                )
                for i, c in enumerate(chunks)
            ]
            await ChunkRepository(session).bulk_create(chunk_rows)

            doc.processing_status = "completed"
            doc.page_count = max((c["page_number"] for c in chunks), default=0)
            doc.error_message = None
            log.info("document_processed", document_id=str(doc.id), chunks=len(chunks))
        except Exception as e:
            doc.processing_status = "failed"
            doc.error_message = str(e)[:1000]
            log.error("document_failed", document_id=str(doc.id), error=str(e))

        await session.commit()


async def _extract(doc: Document) -> list[tuple[int, str]]:
    pages = load_document(doc.storage_path, doc.file_type.value)
    if not pages:
        raise ProcessingError("Document produced no pages.")
    return pages
