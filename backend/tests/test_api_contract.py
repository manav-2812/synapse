"""API contract tests: folders, analytics, document status, upload-into-folder.

These lock in the corrected backend contract from the Phase-1 audit, including
the upload `folder_id` fix (A3) where the field must bind from the multipart
body, not a query parameter.
"""
import os
import tempfile

from app.services.processing_service import process_document


async def test_folder_crud(client, registered_user):
    headers = registered_user["headers"]
    name = f"Folder-{os.urandom(4).hex()}"

    create = await client.post(
        "/api/v1/documents/folders", json={"name": name}, headers=headers
    )
    assert create.status_code == 201, create.text
    folder_id = create.json()["id"]

    listed = await client.get("/api/v1/documents/folders", headers=headers)
    assert listed.status_code == 200
    assert folder_id in [f["id"] for f in listed.json()]

    deleted = await client.delete(
        f"/api/v1/documents/folders/{folder_id}", headers=headers
    )
    assert deleted.status_code == 200

    listed2 = await client.get("/api/v1/documents/folders", headers=headers)
    assert folder_id not in [f["id"] for f in listed2.json()]


async def test_analytics_dashboard_shape(client, registered_user):
    headers = registered_user["headers"]
    r = await client.get("/api/v1/analytics/dashboard", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "summary" in body
    assert "documents_uploaded_count" in body["summary"]
    assert isinstance(body.get("recent_documents", []), list)
    assert isinstance(body.get("recent_quizzes", []), list)


async def test_upload_sets_folder_id(client, registered_user):
    """A3 regression: folder_id sent in the multipart body must be persisted."""
    headers = registered_user["headers"]
    folder = await client.post(
        "/api/v1/documents/folders",
        json={"name": f"Drop-{os.urandom(4).hex()}"},
        headers=headers,
    )
    assert folder.status_code == 201
    folder_id = folder.json()["id"]

    content = "ATP is synthesized in the mitochondrial matrix during oxidative phosphorylation."
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        with open(path, "rb") as f:
            r = await client.post(
                "/api/v1/documents/upload",
                files={"file": ("notes.txt", f, "text/plain")},
                data={"folder_id": folder_id},
                headers=headers,
            )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["folder_id"] == folder_id

        # And the persisted row reflects it via the GET endpoint.
        got = await client.get(f"/api/v1/documents/{body['id']}", headers=headers)
        assert got.json()["folder_id"] == folder_id
    finally:
        os.unlink(path)


async def test_document_status_response_shape(client, registered_user):
    headers = registered_user["headers"]
    content = "The central dogma: DNA -> RNA -> protein."
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
        doc_id = r.json()["id"]
        await process_document(doc_id)

        status = await client.get(
            f"/api/v1/documents/{doc_id}/status", headers=headers
        )
        assert status.status_code == 200
        body = status.json()
        # Exactly the documented polling contract fields.
        for key in ("id", "processing_status", "page_count", "error_message", "chunk_count"):
            assert key in body
        assert body["processing_status"] == "completed"
        assert body["chunk_count"] > 0
    finally:
        os.unlink(path)
