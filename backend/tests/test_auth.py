"""Auth flow tests: signup, login, refresh, logout, protected routes."""
import uuid

from app.core.database import AsyncSessionLocal


async def test_signup_and_protected_route(client, registered_user):
    headers = registered_user["headers"]
    r = await client.get("/api/v1/users/me", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == registered_user["email"]
    assert body["profile"] is not None


async def test_login_wrong_password(client, registered_user):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": "wrong-password"},
    )
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid email or password."


async def test_login_nonexistent_user(client):
    """Timing mitigation test: nonexistent user returns same 401 error."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent_random_user@synapse-study.com", "password": "wrong-password"},
    )
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid email or password."


async def test_duplicate_email_rejected(client, registered_user):
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": registered_user["email"],
            "password": "password123",
            "full_name": "Dup",
        },
    )
    assert r.status_code == 409


async def test_protected_route_requires_token(client):
    r = await client.get("/api/v1/users/me")
    assert r.status_code == 401


async def test_refresh_rotates_token(client, registered_user):
    # Login to get a refresh token.
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    assert r.status_code == 200
    refresh = r.json()["refresh_token"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200
    new_access = r.json()["access_token"]
    assert new_access

    # The same refresh token cannot be used twice (rotation / single-use).
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 401


async def test_logout_invalidates_refresh(client, registered_user):
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": registered_user["email"], "password": registered_user["password"]},
    )
    refresh = r.json()["refresh_token"]
    await client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 401


async def test_signup_rejects_password_over_72_bytes(client):
    """Reject passwords exceeding bcrypt 72-byte limit to avoid silent truncation."""
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": "toolong@synapse-study.com",
            "password": "a" * 73,
            "full_name": "Too Long",
        },
    )
    assert r.status_code == 422


async def test_signup_response_omits_dev_verify_link(client):
    """Ensure dev_verify_link is never returned in HTTP response bodies."""
    unique_email = f"nodevlink_{uuid.uuid4().hex[:8]}@synapse-study.com"
    r = await client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique_email,
            "password": "valid_password_123",
            "full_name": "No Dev Link",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert "dev_verify_link" not in body
    assert body["is_verified"] is False


async def test_brute_force_lockout(client, registered_user):
    """10 failed password attempts lock the account temporarily."""
    email = registered_user["email"]
    for i in range(9):
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": f"wrong_{i}"},
        )
        assert r.status_code == 401

    # 10th failure triggers lockout
    r10 = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong_10"},
    )
    assert r10.status_code == 401

    # 11th attempt returns 403 Forbidden due to lockout
    r11 = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong_11"},
    )
    assert r11.status_code == 403
    assert "locked" in str(r11.json()).lower()


async def test_resend_verification_anti_enumeration(client):
    """Resending verification for non-existent or existing emails returns generic 200."""
    r = await client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "nonexistent@synapse-study.com"},
    )
    assert r.status_code == 200
    assert "if the account exists" in r.json()["message"].lower()

