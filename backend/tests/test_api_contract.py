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


async def test_rate_limit_chat_endpoint(client, registered_user):
    """Exceeding 20 requests/min on /chat/message must return HTTP 429."""
    from app.core.limiter import limiter
    limiter.enabled = True
    try:
        headers = registered_user["headers"]
        payload = {"message": "Hello test", "conversation_id": None}
        
        statuses = []
        # 20 allowed + 1 to exceed rate limit
        for _ in range(22):
            r = await client.post("/api/v1/chat/message", json=payload, headers=headers)
            statuses.append(r.status_code)

        assert 429 in statuses, f"Expected 429 status code in responses, got: {statuses}"
    finally:
        limiter.enabled = False


async def test_health_check_returns_db_status(client):
    """GET /health must return 200 with database: connected."""
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"


async def test_forgot_password_non_enumeration(client):
    """POST /auth/forgot-password always returns 200 regardless of email existence."""
    # Non-existent email — should still return 200 (no enumeration)
    r = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "does_not_exist_12345@synapse-study.com"},
    )
    assert r.status_code == 200
    assert "reset link" in r.json()["message"].lower()


async def test_reset_password_with_valid_token(client, registered_user, session):
    """Full password reset flow: forgot → reset → login with new password."""
    email = registered_user["email"]
    new_password = "new_secure_password_999"

    # Request password reset
    r_forgot = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert r_forgot.status_code == 200

    # Retrieve user from DB to get the reset_token_jti
    from app.models.user import User
    from sqlalchemy import select
    from app.core.security import create_reset_token

    res = await session.execute(select(User).where(User.email == email))
    user = res.scalar_one()
    token = create_reset_token(email, token_id=user.reset_token_jti)

    # Reset the password
    r = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": new_password},
    )
    assert r.status_code == 200
    assert r.json()["message"] == "Password updated successfully."

    # Single-use: attempting to use the same reset token again fails
    r_reuse = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "another_new_password_888"},
    )
    assert r_reuse.status_code == 401

    # Login with the new password should succeed
    r2 = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": new_password},
    )
    assert r2.status_code == 200
    assert "access_token" in r2.json()


async def test_magic_bytes_rejects_mismatched_file(client, registered_user):
    """Upload a .pdf whose content is actually a PNG header → 422."""
    headers = registered_user["headers"]
    # PNG magic bytes disguised as a .pdf
    fake_pdf_content = b"\x89\x50\x4E\x47\x0D\x0A\x1A\x0A" + b"not a pdf" * 10

    r = await client.post(
        "/api/v1/documents/upload",
        files={"file": ("fake.pdf", fake_pdf_content, "application/pdf")},
        headers=headers,
    )
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


async def test_signup_rejects_placeholder_domains(client):
    """Sign up with a dummy/placeholder domain (e.g. example.com) must be rejected with 422."""
    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": "fake_user@example.com", "password": "password123", "full_name": "Fake User"},
    )
    assert r.status_code == 422, f"Expected 422 for example.com, got {r.status_code}: {r.text}"


async def test_signup_rejects_disposable_domain(client):
    """Sign up with a disposable email domain (e.g. mailinator.com) must be rejected with 422."""
    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": "temp_user@mailinator.com", "password": "password123", "full_name": "Temp User"},
    )
    assert r.status_code == 422, f"Expected 422 for mailinator.com, got {r.status_code}: {r.text}"


async def test_signup_requires_email_verification_before_login(client):
    """Signup flow requires verification token before login is permitted."""
    import uuid
    from app.core.security import create_verification_token

    email = f"verify_flow_{uuid.uuid4().hex[:8]}@synapse-study.com"
    password = "secure_password_123"

    # 1. Signup
    r_signup = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "full_name": "Verify Flow"},
    )
    assert r_signup.status_code == 201, r_signup.text
    signup_data = r_signup.json()
    assert signup_data["is_verified"] is False
    assert "check your email" in signup_data["message"].lower()

    # 2. Login before verification is blocked with 403
    r_unver_login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert r_unver_login.status_code == 403, r_unver_login.text
    assert "verify" in r_unver_login.json()["error"]["message"].lower()

    # 3. Resend verification
    r_resend = await client.post(
        "/api/v1/auth/resend-verification",
        json={"email": email},
    )
    assert r_resend.status_code == 200

    # 4. Verify email with token
    token = create_verification_token(email)
    r_verify = await client.post(
        "/api/v1/auth/verify-email",
        json={"token": token},
    )
    assert r_verify.status_code == 200, r_verify.text
    assert "access_token" in r_verify.json()

    # 5. Login after verification succeeds
    r_login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert r_login.status_code == 200
    assert "access_token" in r_login.json()


async def test_invalid_uuid_returns_400_clean_error(client, registered_user):
    """Passing an invalid UUID returns a clean 400 Bad Request instead of unhandled 500."""
    headers = registered_user["headers"]

    r_chat = await client.get("/api/v1/chat/conversations/not-a-uuid", headers=headers)
    assert r_chat.status_code == 400, r_chat.text
    body_chat = r_chat.json()
    assert "error" in body_chat
    assert body_chat["error"]["code"] == "bad_request"
    assert "Invalid UUID" in body_chat["error"]["message"]

    r_doc = await client.get("/api/v1/documents/not-a-uuid", headers=headers)
    assert r_doc.status_code == 400, r_doc.text
    body_doc = r_doc.json()
    assert "error" in body_doc
    assert body_doc["error"]["code"] == "bad_request"
    assert "Invalid UUID" in body_doc["error"]["message"]


async def test_gdpr_export_and_account_deletion(client, registered_user):
    """GET /users/me/export downloads GDPR archive, DELETE /users/me permanently deletes user."""
    headers = registered_user["headers"]

    # 1. Test GDPR export
    r_export = await client.get("/api/v1/users/me/export", headers=headers)
    assert r_export.status_code == 200, r_export.text
    data = r_export.json()
    assert data["format"] == "synapse-gdpr-export-v1"
    assert "user" in data
    assert data["user"]["email"] == registered_user["email"]
    assert "folders" in data
    assert "documents" in data
    assert "conversations" in data
    assert "study_notes" in data
    assert "quizzes" in data
    assert "flashcards" in data

    # 2. Test Right to Erasure / Account Deletion
    r_del = await client.delete("/api/v1/users/me", headers=headers)
    assert r_del.status_code == 200, r_del.text
    assert r_del.json().get("deleted") is True

    # 3. Subsequent authenticated requests fail
    r_me = await client.get("/api/v1/users/me", headers=headers)
    assert r_me.status_code == 401




