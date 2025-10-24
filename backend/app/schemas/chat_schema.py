"""Pydantic schemas for RAG chat."""
from datetime import datetime

from pydantic import BaseModel, Field




class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = None
    document_scope: list[str] | None = Field(
        default=None, description="Restrict retrieval to these document IDs."
    )


class SourceResponse(BaseModel):
    document_id: str | None = None
    document_name: str | None = None
    chunk_id: str | None = None
    chunk_text: str
    page_number: int | None = None
    score: float | None = None


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime
    sources: list[SourceResponse] = []


class ConversationListItem(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


class ConversationDetail(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageResponse]


class ConversationRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class MessageUpdateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
