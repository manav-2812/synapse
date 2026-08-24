"""Passkey (WebAuthn / FIDO2) API routes."""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundError
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.auth_schema import TokenResponse
from app.schemas.passkey_schema import (
    PasskeyItemResponse,
    PasskeyLoginVerifyRequest,
    PasskeyOptionsResponse,
    PasskeyRegisterVerifyRequest,
)
from app.services.passkey_service import PasskeyService

router = APIRouter(prefix="/api/v1/auth/passkey", tags=["passkeys"])


# ==================== Registration ====================

@router.post("/register/options", response_model=PasskeyOptionsResponse)
async def get_registration_options(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate options to register a new Passkey for the logged-in user."""
    service = PasskeyService(session)
    challenge_id, options = await service.get_registration_options(current_user)
    return PasskeyOptionsResponse(challenge_id=challenge_id, options=options)


@router.post("/register/verify", response_model=PasskeyItemResponse, status_code=status.HTTP_201_CREATED)
async def verify_registration(
    payload: PasskeyRegisterVerifyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Verify browser attestation response and save the passkey to user's account."""
    service = PasskeyService(session)
    passkey = await service.verify_registration(
        user=current_user,
        challenge_id=payload.challenge_id,
        credential_payload=payload.credential,
        passkey_name=payload.name,
    )
    await session.commit()
    return passkey


# ==================== Authentication ====================

@router.post("/login/options", response_model=PasskeyOptionsResponse)
@limiter.limit("20/minute")
async def get_login_options(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate assertion challenge for logging in with a Passkey."""
    service = PasskeyService(session)
    challenge_id, options = await service.get_authentication_options()
    return PasskeyOptionsResponse(challenge_id=challenge_id, options=options)


@router.post("/login/verify", response_model=TokenResponse)
@limiter.limit("15/minute")
async def verify_login(
    request: Request,
    payload: PasskeyLoginVerifyRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Verify signed passkey assertion from browser and return access & refresh tokens."""
    service = PasskeyService(session)
    _, access_token, refresh_token = await service.verify_authentication(
        challenge_id=payload.challenge_id,
        credential_payload=payload.credential,
    )
    await session.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ==================== Management ====================

@router.get("/list", response_model=list[PasskeyItemResponse])
async def list_passkeys(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """List all registered passkeys for current user."""
    service = PasskeyService(session)
    passkeys = await service.passkey_repo.list_for_user(current_user.id)
    return passkeys


@router.delete("/{passkey_id}", status_code=status.HTTP_200_OK)
async def delete_passkey(
    passkey_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a registered passkey."""
    service = PasskeyService(session)
    deleted = await service.passkey_repo.delete_for_user(passkey_id, current_user.id)
    if not deleted:
        raise NotFoundError("Passkey not found.")
    await session.commit()
    return {"message": "Passkey removed successfully."}
