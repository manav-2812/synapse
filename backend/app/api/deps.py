"""FastAPI dependencies: DB session and current authenticated user."""
import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import ACCESS_TOKEN_TYPE, decode_token
from app.repositories.user_repository import UserRepository

from app.core.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> "User":  # noqa: F821
    from app.models.user import User

    if credentials is None:
        raise UnauthorizedError("Missing bearer token.")
    try:
        claims = decode_token(credentials.credentials)
    except Exception:
        raise UnauthorizedError("Invalid or expired token.")

    if claims.get("type") != ACCESS_TOKEN_TYPE:
        raise UnauthorizedError("Wrong token type.")

    user_id = claims.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (TypeError, ValueError):
        raise UnauthorizedError("Invalid token subject.")

    user = await UserRepository(session).get_by_id(user_uuid)
    if user is None:
        raise UnauthorizedError("User no longer exists.")
    return user


# Re-export so routers can type-annotate without importing the model directly
__all__ = ["get_db", "get_current_user"]
