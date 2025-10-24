"""Shared pytest fixtures for the Synapse backend test suite.

The async SQLAlchemy engine binds to the event loop it first connects on.
pytest-asyncio creates a fresh loop per test by default, which breaks asyncpg
("Event loop is closed"). We build the engine on the *session* loop inside a
session-scoped fixture and patch the app's session factory to use it.
"""
import asyncio
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.main import app


@pytest.fixture
async def db_engine():
    engine = create_async_engine(
        settings.database_url, echo=False, pool_pre_ping=True, future=True
    )
    sessionmaker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    import app.core.database as db
    import app.services.processing_service as ps

    old_engine = db.engine
    old_sm = db.AsyncSessionLocal
    old_ps_sm = ps.AsyncSessionLocal

    db.engine = engine
    db.AsyncSessionLocal = sessionmaker
    ps.AsyncSessionLocal = sessionmaker

    yield engine

    await engine.dispose()
    db.engine = old_engine
    db.AsyncSessionLocal = old_sm
    ps.AsyncSessionLocal = old_ps_sm


@pytest.fixture
async def client(db_engine):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def session(db_engine):
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        yield s


@pytest.fixture
async def registered_user(client, db_engine):
    """Sign up a fresh user, yield (headers, user_id, email, password), then clean up."""
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    password = "password123"
    r = await client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "full_name": "Test User"},
    )
    assert r.status_code == 201, r.text
    access = r.json()["access_token"]
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {access}"})
    user_id = me.json()["id"]
    headers = {"Authorization": f"Bearer {access}"}
    yield {"headers": headers, "user_id": user_id, "email": email, "password": password}

    from app.ai.vectorstore import chroma_client
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import delete

    from app.models.user import User

    try:
        await chroma_client.delete_collection(user_id)
    except Exception:
        pass
    async with AsyncSessionLocal() as s:
        await s.execute(delete(User).where(User.id == uuid.UUID(user_id)))
        await s.commit()
