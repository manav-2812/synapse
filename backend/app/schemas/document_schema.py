"""Pydantic schemas for documents and folders."""
from datetime import datetime

from pydantic import BaseModel, Field, field_serializer, model_validator

from app.core.constants import FileType, ProcessingStatus


class DocumentResponse(BaseModel):
    id: str
    user_id: str
    folder_id: str | None = None
    filename: str
    original_filename: str
    file_type: str
    file_size_bytes: int
    processing_status: str
    page_count: int | None = None
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data):
        if not isinstance(data, dict):
            return {
                "id": str(data.id),
                "user_id": str(data.user_id),
                "folder_id": str(data.folder_id) if data.folder_id else None,
                "filename": data.filename,
                "original_filename": data.original_filename,
                "file_type": data.file_type.value if isinstance(data.file_type, FileType) else data.file_type,
                "file_size_bytes": data.file_size_bytes,
                "processing_status": data.processing_status.value
                if isinstance(data.processing_status, ProcessingStatus)
                else data.processing_status,
                "page_count": getattr(data, "page_count", None),
                "error_message": getattr(data, "error_message", None),
                "created_at": data.created_at,
            }
        return data

    @field_serializer("id", "user_id")
    def _uuid(self, v: str) -> str:
        return str(v)


class DocumentStatusResponse(BaseModel):
    id: str
    processing_status: str
    page_count: int | None = None
    error_message: str | None = None
    chunk_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data):
        if not isinstance(data, dict):
            return {
                "id": str(data.id),
                "processing_status": data.processing_status.value
                if isinstance(data.processing_status, ProcessingStatus)
                else data.processing_status,
                "page_count": getattr(data, "page_count", None),
                "error_message": getattr(data, "error_message", None),
                "chunk_count": getattr(data, "chunk_count", 0) or 0,
            }
        return data

    @field_serializer("id")
    def _uuid(self, v: str) -> str:
        return str(v)


class DocumentUpdateRequest(BaseModel):
    folder_id: str | None = None
    original_filename: str | None = Field(default=None, max_length=512)


class FolderResponse(BaseModel):
    id: str
    user_id: str
    name: str
    parent_folder_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data):
        if not isinstance(data, dict):
            return {
                "id": str(data.id),
                "user_id": str(data.user_id),
                "name": data.name,
                "parent_folder_id": str(data.parent_folder_id) if data.parent_folder_id else None,
                "created_at": data.created_at,
            }
        return data

    @field_serializer("id", "user_id")
    def _uuid(self, v: str) -> str:
        return str(v)


class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    parent_folder_id: str | None = None
