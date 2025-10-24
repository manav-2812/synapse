"""Document upload + background processing pipeline (real embeddings + Chroma)."""
import asyncio
import tempfile
import os

from app.services.processing_service import process_document


async def test_upload_and_process_completes(client, registered_user):
    headers = registered_user["headers"]
    content = (
        "Mitochondria are the powerhouse of the cell. They perform cellular "
        "respiration to produce ATP. The Krebs cycle occurs in the mitochondrial matrix."
    )
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        with open(path, "rb") as f:
            r = await client.post(
                "/api/v1/documents/upload",
                files={"file": ("notes.txt", f, "text/plain")},
                headers=headers,
            )
        assert r.status_code == 201, r.text
        doc_id = r.json()["id"]

        # Run the ingestion pipeline synchronously for deterministic testing.
        await process_document(doc_id)

        status = await client.get(f"/api/v1/documents/{doc_id}/status", headers=headers)
        body = status.json()
        assert body["processing_status"] == "completed", body
        assert body["chunk_count"] > 0
    finally:
        os.unlink(path)


async def test_document_list_and_delete(client, registered_user):
    headers = registered_user["headers"]
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write("Short note about diffusion across cell membranes.")
        path = f.name
    try:
        with open(path, "rb") as f:
            r = await client.post(
                "/api/v1/documents/upload",
                files={"file": ("m.txt", f, "text/plain")},
                headers=headers,
            )
        doc_id = r.json()["id"]

        listing = await client.get("/api/v1/documents", headers=headers)
        assert listing.status_code == 200
        assert any(d["id"] == doc_id for d in listing.json())

        delete = await client.delete(f"/api/v1/documents/{doc_id}", headers=headers)
        assert delete.status_code == 200
    finally:
        os.unlink(path)
