"""Rate limiter (slowapi). Scoped per authenticated user with fallback to remote IP."""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.security import decode_token


def get_user_or_ip(request: Request) -> str:
    """Return 'user:<user_id>' if valid Bearer token is present, else remote IP."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth[7:].strip()
        try:
            claims = decode_token(token)
            sub = claims.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_user_or_ip,
    default_limits=[],
    enabled=settings.app_env.lower() not in ("testing", "test"),
)


