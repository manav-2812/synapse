"""Document routes: upload, list, status, update, delete, folders."""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.limiter import limiter
from app.schemas.document_schema import (
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUpdateRequest,
)
from app.services.document_service import DocumentService

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def upload_document(
    request: Request,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: str | None = Form(None),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    doc = await svc.upload(file, current_user.id, uuid.UUID(folder_id) if folder_id else None, background)
    await session.commit()
    return doc


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    folder_id: str | None = None,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    return await svc.list_documents(current_user.id, uuid.UUID(folder_id) if folder_id else None)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    return await svc.get_document(uuid.UUID(document_id), current_user.id)


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
async def get_status(
    document_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    res = await svc.get_status(uuid.UUID(document_id), current_user.id)
    doc = res["document"]
    return DocumentStatusResponse(
        id=str(doc.id),
        processing_status=doc.processing_status.value
        if hasattr(doc.processing_status, "value")
        else doc.processing_status,
        page_count=doc.page_count,
        error_message=doc.error_message,
        chunk_count=res["chunk_count"],
    )


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    payload: DocumentUpdateRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    return await svc.update_document(
        uuid.UUID(document_id),
        current_user.id,
        uuid.UUID(payload.folder_id) if payload.folder_id else None,
        payload.original_filename,
    )


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
async def delete_document(
    document_id: str,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    svc = DocumentService(session)
    await svc.delete_document(uuid.UUID(document_id), current_user.id)
    return {"message": "Document deleted."}
