"""Folders for organizing documents (supports nesting)."""
import uuid

from sqlalchemy import String, Uuid, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Folder(Base, TimestampMixin):
    __tablename__ = "folders"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    parent_folder_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    parent: Mapped["Folder | None"] = relationship(
        "Folder", remote_side="Folder.id", back_populates="children"
    )
    children: Mapped[list["Folder"]] = relationship(
        "Folder", back_populates="parent", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Folder {self.name}>"
