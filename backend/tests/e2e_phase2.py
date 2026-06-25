"""End-to-end Phase 2 test: upload a real PDF, process it, verify chunks + vectors."""
import asyncio
import io
import uuid

import fitz  # PyMuPDF (creates the test PDF)
import httpx
from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
from app.models.document_chunk import DocumentChunk
from app.ai.vectorstore import chroma_client


BASE = "http://127.0.0.1:8000"


def make_test_pdf() -> bytes:
    """Build a 3-page PDF with real text content."""
    doc = fitz.open()
    pages = [
        "Synapse Study Notes — Page 1. Mitochondria are the powerhouse of the cell, "
        "generating ATP through oxidative phosphorylation.",
        "Synapse Study Notes — Page 2. Photosynthesis converts light energy into chemical "
        "energy, producing glucose and oxygen from carbon dioxide and water.",
        "Synapse Study Notes — Page 3. The central dogma of molecular biology states that "
        "DNA is transcribed to RNA, which is translated into protein.",
    ]
    for text in pages:
        p = doc.new_page()
        p.insert_text((72, 72), text, fontsize=12)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


async def main():
    async with AsyncSessionLocal() as session:
        pass  # just to ensure engine import works

    async with httpx.AsyncClient(base_url=BASE) as c:
        email = f"phase2-{uuid.uuid4().hex[:8]}@synapse.dev"
        r = await c.post(
            "/api/v1/auth/signup",
            json={"email": email, "password": "password123", "full_name": "Phase2"},
        )
        assert r.status_code == 201, r.text
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        pdf = make_test_pdf()
        files = {"file": ("notes.pdf", pdf, "application/pdf")}
        r = await c.post("/api/v1/documents/upload", headers=headers, files=files)
        print("UPLOAD:", r.status_code)
        if r.status_code != 201:
            print("UPLOAD BODY:", r.text)
            return
        doc_id = r.json()["id"]
        print("DOC ID:", doc_id, "status:", r.json()["processing_status"])

        # Poll status
        for _ in range(40):
            await asyncio.sleep(2)
            r = await c.get(f"/api/v1/documents/{doc_id}/status", headers=headers)
            st = r.json()
            print("STATUS:", st["processing_status"], "chunks:", st.get("chunk_count"), "pages:", st.get("page_count"))
            if st["processing_status"] in ("completed", "failed"):
                if st["processing_status"] == "failed":
                    print("ERROR:", st.get("error_message"))
                break

        # Verify DB chunks
        async with AsyncSessionLocal() as session:
            cnt = await session.execute(
                select(func.count()).select_from(DocumentChunk).where(
                    DocumentChunk.document_id == uuid.UUID(doc_id)
                )
            )
            db_chunks = cnt.scalar() or 0

        # Verify Chroma vectors for this user
        col = chroma_client._get_collection(email.split("@")[0])  # noqa: SLF001
        # user id is the token subject; fetch from doc
        async with AsyncSessionLocal() as session:
            from app.models.document import Document

            d = await session.get(Document, uuid.UUID(doc_id))
            col = chroma_client._get_collection(str(d.user_id))  # noqa: SLF001
            chroma_count = col.count()

        print("\n=== RESULTS ===")
        print("DB chunks:", db_chunks)
        print("Chroma collection count (all user docs):", chroma_count)
        print("PASS" if db_chunks > 0 and chroma_count > 0 else "FAIL")


asyncio.run(main())
