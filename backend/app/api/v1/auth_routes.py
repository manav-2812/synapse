"""Auth routes: signup, login, refresh, logout."""
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import UnauthorizedError
from app.core.limiter import limiter
from app.schemas.auth_schema import (
    GoogleOAuthRequest,
    LoginRequest,
    LogoutRequest,
    MicrosoftOAuthRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
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



@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, session: AsyncSession = Depends(get_db)):
    service = AuthService(session)
    _, access, refresh = await service.signup(payload)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request, payload: LoginRequest, session: AsyncSession = Depends(get_db)
):
    service = AuthService(session)
    _, access, refresh = await service.login(payload)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db)):
    service = AuthService(session)
    _, access, refresh = await service.refresh(payload.refresh_token)
    await session.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(payload: LogoutRequest, session: AsyncSession = Depends(get_db)):
    service = AuthService(session)
    await service.logout(payload.refresh_token)
    await session.commit()
    return {"message": "Logged out."}
