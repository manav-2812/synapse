"""Auth routes: signup, verification, login, refresh, logout, password reset."""
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.core.limiter import limiter
from app.core.exceptions import NotFoundError
from app.repositories.user_repository import UserRepository
from app.schemas.auth_schema import (
    ForgotPasswordRequest,
    GoogleOAuthRequest,
    LoginRequest,
    LogoutRequest,
    MicrosoftOAuthRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SignupRequest,
    SignupResponse,
    TokenResponse,
    VerifyEmailRequest,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/oauth/google", response_model=TokenResponse)
@limiter.limit("15/minute")
async def oauth_google(
    request: Request,
    payload: GoogleOAuthRequest,
    session: AsyncSession = Depends(get_db),
):
    """Authenticate or register user via Google OAuth 2.0."""
    service = AuthService(session)
    _, access, refresh = await service.login_with_google(payload)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/oauth/microsoft", response_model=TokenResponse)
@limiter.limit("15/minute")
async def oauth_microsoft(
    request: Request,
    payload: MicrosoftOAuthRequest,
    session: AsyncSession = Depends(get_db),
):
    """Authenticate or register user via Microsoft OAuth 2.0."""
    service = AuthService(session)
    _, access, refresh = await service.login_with_microsoft(payload)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def signup(
    request: Request,
    payload: SignupRequest,
    session: AsyncSession = Depends(get_db),
):
    """Register account with certified email validation and dispatch verification email.

    Security: dev_verify_link is intentionally absent from the response -- signed
    links are written to the server log only and never returned in HTTP bodies.
    """
    service = AuthService(session)
    user, _ = await service.signup(payload)
    await session.commit()
    return SignupResponse(
        message="Account created! Please check your email to verify your account.",
        email=user.email,
        is_verified=False,
    )


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("20/minute")
async def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db),
):
    """Confirm email verification token and return active session tokens."""
    service = AuthService(session)
    _, access, refresh = await service.verify_email(payload.token)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/resend-verification", status_code=status.HTTP_200_OK)
@router.post("/resend-code", status_code=status.HTTP_200_OK, include_in_schema=False)
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    session: AsyncSession = Depends(get_db),
):
    """Resend email verification link (rate-limited to 3/minute).

    Returns a generic message regardless of whether the account exists or is
    already verified -- prevents account enumeration.
    """
    service = AuthService(session)
    await service.resend_verification(payload.email)
    await session.commit()
    return {"message": "If the account exists and is unverified, a verification link has been sent."}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request, payload: LoginRequest, session: AsyncSession = Depends(get_db)
):
    """Sign in with email and password (requires is_verified=True)."""
    service = AuthService(session)
    _, access, refresh = await service.login(payload)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_db),
):
    service = AuthService(session)
    _, access, refresh = await service.refresh(payload.refresh_token)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def logout(
    request: Request,
    payload: LogoutRequest,
    session: AsyncSession = Depends(get_db),
):
    service = AuthService(session)
    await service.logout(payload.refresh_token)
    await session.commit()
    return {"message": "Logged out."}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db),
):
    """Generate a password-reset link.

    Security: the reset link is written to the server log in non-production
    environments and is never included in the HTTP response body.
    """
    service = AuthService(session)
    await service.forgot_password(payload.email)
    await session.commit()
    return {"message": "If an account exists, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db),
):
    """Validate a single-use reset token and update the password."""
    service = AuthService(session)
    await service.reset_password(payload.token, payload.new_password)
    await session.commit()
    return {"message": "Password updated successfully."}


if settings.app_env.lower() != "production":
    @router.post("/e2e-verify", response_model=TokenResponse)
    async def e2e_verify(
        payload: ResendVerificationRequest,
        session: AsyncSession = Depends(get_db),
    ):
        """Non-production helper: activate user account and return tokens for E2E tests."""
        repo = UserRepository(session)
        user = await repo.get_by_email(payload.email.lower().strip())
        if not user:
            raise NotFoundError("User not found.")
        user.is_verified = True
        user.verification_token_jti = None
        service = AuthService(session)
        access, refresh, jti = service._issue_tokens(user)
        user.last_refresh_jti = jti
        await repo.update(user)
        await session.commit()
        return TokenResponse(access_token=access, refresh_token=refresh)
