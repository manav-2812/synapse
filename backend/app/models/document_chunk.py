"""Text chunks extracted from a document (each linked to a Chroma vector)."""
import uuid

from sqlalchemy import Integer, String, Text, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class DocumentChunk(Base, TimestampMixin):
    __tablename__ = "document_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ID of the embedding stored in the user's Chroma collection (not a DB FK).
    chroma_vector_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")  # noqa: F821

    def __repr__(self) -> str:
        return f"<DocumentChunk {self.document_id}#{self.chunk_index}>"
