"""Auth business logic: signup, verification, login, refresh, logout, and OAuth."""
import secrets
import uuid
from datetime import datetime, timezone, timedelta

import httpx
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, UnauthorizedError
from app.core.logger import get_logger
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    RESET_TOKEN_TYPE,
    VERIFICATION_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    create_reset_token,
    create_verification_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.analytics import Analytics
from app.models.user import User
from app.models.user_profile import UserProfile
from app.repositories.user_repository import UserRepository
from app.services.email_service import send_password_reset_email, send_verification_email
from app.schemas.auth_schema import (
    GoogleOAuthRequest,
    LoginRequest,
    MicrosoftOAuthRequest,
    SignupRequest,
)

log = get_logger("auth_service")


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def signup(self, payload: SignupRequest) -> tuple[User, None]:
        """Create account with is_verified=False, dispatch email verification link.

        Returns (user, None) — the dev verification link is intentionally NOT
        returned to the caller.  It is written to the structured server log so
        that developers with log access can copy it without the link ever
        appearing in an HTTP response body.
        """
        if await self.repo.email_exists(payload.email):
            raise ConflictError("An account with this email already exists.")

        verify_jti = uuid.uuid4().hex
        user = User(
            email=payload.email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            is_active=True,
            is_verified=False,
            verification_token_jti=verify_jti,
        )
        await self.repo.create(user)
        # Provision empty profile + analytics for every new user
        await self.repo.create_profile(UserProfile(user_id=user.id))
        await self.repo.create_analytics(Analytics(user_id=user.id))

        # Generate signed verification token
        token = create_verification_token(user.email, token_id=verify_jti)
        frontend_base = settings.frontend_base_url.rstrip("/")
        link = f"{frontend_base}/verify-email?token={token}"
        await send_verification_email(user.email, link, user.full_name)

        # Security: never return signed links in HTTP responses.
        # In non-production envs, write the link to the server log so developers
        # can verify accounts without SMTP configured.
        if settings.app_env.lower() != "production":
            log.info("dev_verify_link", email=user.email, link=link)

        return user, None

    async def verify_email(self, token: str) -> tuple[User, str, str]:
        """Validate verification token, activate user account, and issue session tokens."""
        try:
            claims = decode_token(token)
        except Exception:
            raise UnauthorizedError("Invalid or expired verification link.")
        if claims.get("type") != VERIFICATION_TOKEN_TYPE:
            raise UnauthorizedError("Invalid token type.")

        email = claims.get("sub")
        if not email:
            raise UnauthorizedError("Invalid verification token.")

        user = await self.repo.get_by_email(email)
        if not user:
            raise UnauthorizedError("User no longer exists.")

        # If user is already verified (e.g. strict mode or second click), issue tokens directly
        if user.is_verified:
            access, refresh, jti = self._issue_tokens(user)
            user.last_refresh_jti = jti
            await self.repo.update(user)
            return user, access, refresh

        token_jti = claims.get("jti")
        # Ensure single-use verification token matches latest issued jti
        if user.verification_token_jti and token_jti and user.verification_token_jti != token_jti:
            raise UnauthorizedError("This verification link has already been used or expired.")

        user.is_verified = True
        user.verification_token_jti = None

        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def resend_verification(self, email: str) -> None:
        """Regenerate and resend verification email for an unverified account.

        Always returns None — the dev link is written to the log only.
        """
        user = await self.repo.get_by_email(email.lower().strip())
        if not user or user.is_verified:
            log.info("resend_verification_ignored", email=email)
            return None

        verify_jti = uuid.uuid4().hex
        user.verification_token_jti = verify_jti
        await self.repo.update(user)
        await self.session.commit()

        token = create_verification_token(user.email, token_id=verify_jti)
        frontend_base = settings.frontend_base_url.rstrip("/")
        link = f"{frontend_base}/verify-email?token={token}"
        await send_verification_email(user.email, link, user.full_name)

        if settings.app_env.lower() != "production":
            log.info("dev_verify_link_resent", email=user.email, link=link)

        return None

    async def login(self, payload: LoginRequest) -> tuple[User, str, str]:
        user = await self.repo.get_by_email(payload.email)

        # Check lockout before anything else to prevent timing oracle
        if user and user.locked_until:
            if datetime.now(timezone.utc) < user.locked_until:
                raise ForbiddenError(
                    "Too many failed login attempts. Your account is temporarily locked. "
                    "Please try again later or reset your password."
                )
            else:
                # Lockout period expired — clear it
                user.locked_until = None
                user.failed_login_count = 0
                await self.repo.update(user)

        if not user or not verify_password(payload.password, user.password_hash):
            # Increment failure counter if the user exists
            if user:
                user.failed_login_count = (user.failed_login_count or 0) + 1
                if user.failed_login_count >= settings.login_max_attempts:
                    user.locked_until = datetime.now(timezone.utc) + timedelta(
                        minutes=settings.login_lockout_minutes
                    )
                    log.warning(
                        "account_locked",
                        email=payload.email,
                        attempts=user.failed_login_count,
                    )
                await self.repo.update(user)
                await self.session.commit()
            raise UnauthorizedError("Invalid email or password.")

        if not user.is_active:
            raise ForbiddenError("This account is disabled.")
        if not user.is_verified:
            raise ForbiddenError(
                "Please verify your email address before signing in. Check your inbox for the confirmation link."
            )

        # Successful login — clear brute-force counters
        user.failed_login_count = 0
        user.locked_until = None
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
            # Google One-Tap / Sign-In With Google button path.
            # Use google-auth library which enforces aud, iss, exp -- unlike the
            # raw tokeninfo URL which does NOT check audience.
            try:
                id_info = google_id_token.verify_oauth2_token(
                    payload.credential,
                    google_requests.Request(),
                    audience=settings.google_client_id,
                )
            except ValueError as exc:
                raise UnauthorizedError(f"Google ID token validation failed: {exc}") from exc

            email = id_info.get("email")
            name = id_info.get("name")
            picture = id_info.get("picture")
        else:
            raise BadRequestError("Missing Google authorization code or credential token.")

        if not email:
            raise UnauthorizedError("Google account does not provide a verified email.")

        email_clean = email.lower().strip()
        user = await self.repo.get_by_email(email_clean)

        if not user:
            # Create user on first Google login (OAuth emails are pre-verified)
            user = User(
                email=email_clean,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name=name or email_clean.split("@")[0],
                profile_image_url=picture,
                is_active=True,
                is_verified=True,
            )
            await self.repo.create(user)
            await self.repo.create_profile(UserProfile(user_id=user.id))
            await self.repo.create_analytics(Analytics(user_id=user.id))
        elif not user.is_active:
            raise ForbiddenError("This account has been disabled.")
        else:
            # Existing account — silent merge (keep password if set, update verification)
            user.is_verified = True
            if picture and not user.profile_image_url:
                user.profile_image_url = picture
            await self.repo.update(user)

        access, refresh, jti = self._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.repo.update(user)
        return user, access, refresh

    async def login_with_microsoft(self, payload: MicrosoftOAuthRequest) -> tuple[User, str, str]:
        """Authenticate user via Microsoft OAuth 2.0."""
        access_token = payload.access_token

        if not access_token and payload.code:
            redirect_uri = payload.redirect_uri or settings.microsoft_redirect_uri
            data: dict[str, str] = {
                "client_id": settings.microsoft_client_id,
                "grant_type": "authorization_code",
                "code": payload.code,
                "redirect_uri": redirect_uri,
                "scope": "openid profile email User.Read",
            }
            if settings.microsoft_client_secret:
                data["client_secret"] = settings.microsoft_client_secret
            if payload.code_verifier:
                data["code_verifier"] = payload.code_verifier

            tenant = settings.microsoft_tenant_id or "common"
            token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            if redirect_uri:
                from urllib.parse import urlparse
                parsed = urlparse(redirect_uri)
                headers["Origin"] = f"{parsed.scheme}://{parsed.netloc}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                token_resp = await client.post(token_url, data=data, headers=headers)
                if token_resp.status_code != 200:
                    log.warning(
                        "microsoft_token_exchange_error",
                        status_code=token_resp.status_code,
                        body=token_resp.text,
                    )
                    raise UnauthorizedError(f"Microsoft token exchange failed: {token_resp.text}")
                token_data = token_resp.json()
                access_token = token_data.get("access_token")

        if not access_token:
            raise BadRequestError("Missing Microsoft authorization code or access token.")

        async with httpx.AsyncClient(timeout=10.0) as client:
            userinfo_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if userinfo_resp.status_code != 200:
                raise UnauthorizedError("Failed to fetch Microsoft profile from Graph API.")
            userinfo = userinfo_resp.json()

        # Microsoft Graph returns 'mail' for work/school accounts and
        # 'userPrincipalName' as a fallback (may be an alias for personal accounts).
        email = userinfo.get("mail") or userinfo.get("userPrincipalName")
        name = userinfo.get("displayName")

        if not email:
            raise UnauthorizedError("Microsoft account does not provide an email.")

        # UPNs ending in onmicrosoft.com are internal routing addresses -- prefer
        # 'mail' field. Log a warning so ops can investigate if needed.
        if email.lower().endswith("onmicrosoft.com") and userinfo.get("mail"):
            email = userinfo["mail"]

        email_clean = email.lower().strip()
        user = await self.repo.get_by_email(email_clean)

        if not user:
            # Create user on first Microsoft login (OAuth emails are pre-verified)
            user = User(
                email=email_clean,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                full_name=name or email_clean.split("@")[0],
                is_active=True,
                is_verified=True,
            )
            await self.repo.create(user)
            await self.repo.create_profile(UserProfile(user_id=user.id))
            await self.repo.create_analytics(Analytics(user_id=user.id))
        elif not user.is_active:
            raise ForbiddenError("This account has been disabled.")
        else:
            user.is_verified = True
            await self.repo.update(user)

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

    async def forgot_password(self, email: str) -> None:
        """Generate a single-use password-reset token and dispatch it via email.

        Always returns None.  In non-production environments the link is written
        to the structured server log (never to the HTTP response body).
        """
        user = await self.repo.get_by_email(email.lower().strip())
        if not user:
            log.info("password_reset_ignored", email=email, reason="no_account")
            return None

        reset_jti = uuid.uuid4().hex
        token = create_reset_token(user.email, token_id=reset_jti)
        # Store the jti so we can invalidate the token on first use
        user.reset_token_jti = reset_jti
        await self.repo.update(user)
        await self.session.commit()

        frontend_base = settings.frontend_base_url.rstrip("/")
        link = f"{frontend_base}/reset?token={token}"
        await send_password_reset_email(user.email, link)

        if settings.app_env.lower() != "production":
            log.info("dev_reset_link", email=user.email, link=link)

        return None

    async def reset_password(self, token: str, new_password: str) -> None:
        """Validate a reset token (single-use) and update the user's password hash."""
        try:
            claims = decode_token(token)
        except Exception:
            raise UnauthorizedError("Invalid or expired reset token.")
        if claims.get("type") != RESET_TOKEN_TYPE:
            raise UnauthorizedError("Invalid token type.")
        email = claims.get("sub")
        if not email:
            raise UnauthorizedError("Invalid reset token.")

        token_jti = claims.get("jti")
        user = await self.repo.get_by_email(email)
        if not user:
            raise UnauthorizedError("User no longer exists.")

        # Single-use enforcement: jti must match the stored one
        if not token_jti or user.reset_token_jti != token_jti:
            raise UnauthorizedError("This reset link has already been used or is invalid.")

        user.password_hash = hash_password(new_password)
        # Consume the token -- any subsequent use of the same link is rejected
        user.reset_token_jti = None
        # Invalidate any existing refresh token so the user must re-login.
        user.last_refresh_jti = None
        # Reset brute-force counter on successful password change
        user.failed_login_count = 0
        user.locked_until = None
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
__all__ = ["AuthService", "ACCESS_TOKEN_TYPE", "REFRESH_TOKEN_TYPE", "VERIFICATION_TOKEN_TYPE"]
