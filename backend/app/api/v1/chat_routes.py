"""Chat routes: streaming RAG answers + conversation management."""
import uuid

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.repositories.document_repository import DocumentRepository
from app.schemas.chat_schema import (
    ChatRequest,
    ConversationDetail,
    ConversationListItem,
    ConversationRenameRequest,
    MessageResponse,
    MessageUpdateRequest,
    SourceResponse,
)
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


@router.post("/message", status_code=status.HTTP_200_OK)
async def chat_message(
    payload: ChatRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    return StreamingResponse(
        svc.chat(payload, current_user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations", response_model=list[ConversationListItem])
async def list_conversations(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    convs = await svc.list_conversations(current_user.id)
    items = []
    for c in convs:
        items.append(
            ConversationListItem(
                id=str(c.id),
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=await svc.repo.message_count(c.id),
            )
        )
    return items


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    conv = await svc.get_conversation(uuid.UUID(conversation_id), current_user.id)

    # Resolve document names for citation chips.
    doc_names: dict[uuid.UUID, str] = {}
    owned = await DocumentRepository(session).list_by_user(current_user.id)
    doc_names = {d.id: d.original_filename for d in owned}

    messages = [
        MessageResponse(
            id=str(m.id),
            role=m.role.value if hasattr(m.role, "value") else m.role,
            content=m.content,
            created_at=m.created_at,
            sources=[
                SourceResponse(
                    document_id=str(s.document_id) if s.document_id else None,
                    document_name=doc_names.get(s.document_id) if s.document_id else None,
                    chunk_id=None,
                    chunk_text=s.chunk_text,
                    page_number=s.page_number,
                    score=s.score,
                )
                for s in m.sources
            ],
        )
        for m in conv.messages
    ]
    return ConversationDetail(
        id=str(conv.id),
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages,
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    await svc.delete_conversation(uuid.UUID(conversation_id), current_user.id)
    return {"message": "Conversation deleted."}


@router.patch("/conversations/{conversation_id}", response_model=ConversationDetail)
async def rename_conversation(
    conversation_id: str,
    payload: ConversationRenameRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    conv = await svc.rename_conversation(uuid.UUID(conversation_id), current_user.id, payload.title)
    return ConversationDetail(
        id=str(conv.id),
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_200_OK,
)
async def delete_message(
    conversation_id: str,
    message_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    await svc.delete_message(
        uuid.UUID(conversation_id), uuid.UUID(message_id), current_user.id
    )
    return {"message": "Message deleted."}


@router.patch(
    "/conversations/{conversation_id}/messages/{message_id}",
    response_model=MessageResponse,
)
async def update_message(
    conversation_id: str,
    message_id: str,
    payload: MessageUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = ChatService(session)
    msg = await svc.update_message(
        uuid.UUID(conversation_id), uuid.UUID(message_id), current_user.id, payload.content
    )
    return MessageResponse(
        id=str(msg.id),
        role=msg.role.value if hasattr(msg.role, "value") else msg.role,
        content=msg.content,
        created_at=msg.created_at,
        sources=[],
    )
