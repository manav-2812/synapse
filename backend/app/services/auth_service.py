"""Auth business logic: signup, login, refresh, logout, and OAuth."""
import secrets
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, UnauthorizedError
from app.core.logger import get_logger
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.analytics import Analytics
from app.models.user import User
from app.models.user_profile import UserProfile
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import (
    GoogleOAuthRequest,
    LoginRequest,
    MicrosoftOAuthRequest,
    SignupRequest,
)

log = get_logger("auth_service")


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.repo = UserRepository(session)

    async def signup(self, payload: SignupRequest) -> tuple[User, str, str]:
        """Create account, provision profile + analytics, return (user, access, refresh)."""
        if await self.repo.email_exists(payload.email):
            raise ConflictError("An account with this email already exists.")
        user = User(
            email=payload.email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            is_active=True,
        )
        await self.repo.create(user)
        # Provision empty profile + analytics for every new user
        await self.repo.create_profile(UserProfile(user_id=user.id))
        await self.repo.create_analytics(Analytics(user_id=user.id))
        # Issue tokens and persist the jti inside the same transaction
        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def login(self, payload: LoginRequest) -> tuple[User, str, str]:
        user = await self.repo.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.password_hash):
            raise UnauthorizedError("Invalid email or password.")
        if not user.is_active:
            raise ForbiddenError("This account is disabled.")
        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def login_with_google(self, payload: GoogleOAuthRequest) -> tuple[User, str, str]:
        """Authenticate user via Google OAuth 2.0 (code exchange or verified ID token)."""
        email: str | None = None
        name: str | None = None
        picture: str | None = None

        if payload.code:
            redirect_uri = payload.redirect_uri or settings.google_redirect_uri
            async with httpx.AsyncClient(timeout=10.0) as client:
                token_resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "code": payload.code,
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                )
                if token_resp.status_code != 200:
                    raise UnauthorizedError(f"Google token exchange failed: {token_resp.text}")
                token_data = token_resp.json()
                google_access_token = token_data.get("access_token")

                # Fetch user profile info
                userinfo_resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {google_access_token}"},
                )
                if userinfo_resp.status_code != 200:
                    raise UnauthorizedError("Failed to fetch Google user profile.")
                userinfo = userinfo_resp.json()
                email = userinfo.get("email")
                name = userinfo.get("name")
                picture = userinfo.get("picture")
        elif payload.credential:
            async with httpx.AsyncClient(timeout=10.0) as client:
                tokeninfo_resp = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.credential}"
                )
                if tokeninfo_resp.status_code != 200:
                    raise UnauthorizedError("Google ID token validation failed.")
                userinfo = tokeninfo_resp.json()
                email = userinfo.get("email")
                name = userinfo.get("name")
                picture = userinfo.get("picture")
        else:
            raise BadRequestError("Missing Google authorization code or credential token.")

        if not email:
            raise UnauthorizedError("Google account does not provide a verified email.")

        email_clean = email.lower().strip()
        user = await self.repo.get_by_email(email_clean)

        if not user:
            # Create user on first Google login
            user = User(
                email=email_clean,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name=name or email_clean.split("@")[0],
                profile_image_url=picture,
                is_active=True,
            )
            await self.repo.create(user)
            await self.repo.create_profile(UserProfile(user_id=user.id))
            await self.repo.create_analytics(Analytics(user_id=user.id))
        elif not user.is_active:
            raise ForbiddenError("This account has been disabled.")
        elif picture and not user.profile_image_url:
            user.profile_image_url = picture
            await self.repo.update(user)

        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def login_with_microsoft(self, payload: MicrosoftOAuthRequest) -> tuple[User, str, str]:
        """Authenticate user via Microsoft OAuth 2.0 / Microsoft Graph API."""
        from urllib.parse import urlparse

        redirect_uri = payload.redirect_uri or settings.microsoft_redirect_uri
        parsed_uri = urlparse(redirect_uri)
        origin = f"{parsed_uri.scheme}://{parsed_uri.netloc}"

        ms_access_token = payload.access_token

        if not ms_access_token:
            if not payload.code:
                raise BadRequestError("Missing Microsoft authorization code or access token.")

            tenant_id = settings.microsoft_tenant_id or "common"
            token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

            token_req_data = {
                "client_id": settings.microsoft_client_id,
                "scope": "openid profile email User.Read",
                "code": payload.code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
            if settings.microsoft_client_secret:
                token_req_data["client_secret"] = settings.microsoft_client_secret
            if payload.code_verifier:
                token_req_data["code_verifier"] = payload.code_verifier

            headers = {
                "Origin": origin,
            }

            async with httpx.AsyncClient(timeout=10.0) as client:
                token_resp = await client.post(token_url, data=token_req_data, headers=headers)
                if token_resp.status_code != 200:
                    log.error("microsoft_token_error", status=token_resp.status_code, body=token_resp.text)
                    raise UnauthorizedError(f"Microsoft token exchange failed: {token_resp.text}")
                token_data = token_resp.json()
                ms_access_token = token_data.get("access_token")

        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch user profile from Microsoft Graph
            graph_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {ms_access_token}"},
            )
            if graph_resp.status_code != 200:
                raise UnauthorizedError("Failed to fetch Microsoft user profile.")
            userinfo = graph_resp.json()

        email = userinfo.get("mail") or userinfo.get("userPrincipalName")
        name = userinfo.get("displayName")

        if not email:
            raise UnauthorizedError("Microsoft account does not provide an email.")

        email_clean = email.lower().strip()
        user = await self.repo.get_by_email(email_clean)

        if not user:
            # Create user on first Microsoft login
            user = User(
                email=email_clean,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name=name or email_clean.split("@")[0],
                is_active=True,
            )
            await self.repo.create(user)
            await self.repo.create_profile(UserProfile(user_id=user.id))
            await self.repo.create_analytics(Analytics(user_id=user.id))
        elif not user.is_active:
            raise ForbiddenError("This account has been disabled.")

        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def refresh(self, refresh_token: str) -> tuple[User, str, str]:
        try:
            claims = decode_token(refresh_token)
        except Exception:
            raise UnauthorizedError("Invalid refresh token.")
        if claims.get("type") != REFRESH_TOKEN_TYPE:
            raise UnauthorizedError("Invalid token type.")
        user_id = _to_uuid(claims.get("sub"))
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise UnauthorizedError("User no longer exists.")
        # Single-use: the presented jti must match the stored one
        if user.last_refresh_jti != claims.get("jti"):
            raise UnauthorizedError("Refresh token has been revoked or already used.")
        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        try:
            claims = decode_token(refresh_token)
        except Exception:
            return
        if claims.get("type") != REFRESH_TOKEN_TYPE:
            return
        user = await self.repo.get_by_id(_to_uuid(claims.get("sub")))
        if user and user.last_refresh_jti == claims.get("jti"):
            user.last_refresh_jti = None
            await self.repo.update(user)

    def _issue_tokens(self, user: User) -> tuple[str, str, str]:
        jti = uuid.uuid4().hex
        access = create_access_token(str(user.id))
        refresh = create_refresh_token(str(user.id), jti)
        return access, refresh, jti


def _to_uuid(value: str | None) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        raise UnauthorizedError("Invalid token subject.")


# Re-export token type constants for route-layer convenience
__all__ = ["AuthService", "ACCESS_TOKEN_TYPE", "REFRESH_TOKEN_TYPE"]
