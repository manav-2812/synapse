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
