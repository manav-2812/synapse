"""Passkey (WebAuthn / FIDO2) registration and authentication service."""
import json
import uuid
from datetime import timezone
from typing import Any
from urllib.parse import urlparse

import webauthn
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    UserVerificationRequirement,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, ConflictError, UnauthorizedError
from app.core.logger import get_logger
from app.models.passkey import UserPasskey
from app.models.user import User
from app.repositories.passkey_repository import PasskeyRepository
from app.repositories.passkey_challenge_repository import PasskeyChallengeRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

log = get_logger("passkey")


class PasskeyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.passkey_repo = PasskeyRepository(session)
        self.challenge_repo = PasskeyChallengeRepository(session)
        self.user_repo = UserRepository(session)
        self.auth_service = AuthService(session)

    def _get_rp_id(self, request: Any = None) -> str:
        """RP ID derived from config, request origin/referer, or frontend_base_url.

        The RP ID must match the effective domain the frontend is served from (e.g. 'localhost').
        """
        if settings.webauthn_rp_id:
            return settings.webauthn_rp_id

        # 1. Try to extract hostname from Request Origin / Referer
        if request:
            origin = request.headers.get("origin") or request.headers.get("referer")
            if origin:
                parsed_origin = urlparse(origin)
                if parsed_origin.hostname:
                    return parsed_origin.hostname

        # 2. Try frontend_base_url (defaults to http://localhost:5173 -> 'localhost')
        if settings.frontend_base_url:
            parsed_fe = urlparse(settings.frontend_base_url)
            if parsed_fe.hostname:
                return parsed_fe.hostname

        # 3. Fallback to app_base_url or 'localhost'
        parsed = urlparse(settings.app_base_url)
        return parsed.hostname or "localhost"

    def _get_rp_origins(self, request: Any = None) -> list[str]:
        """Returns list of permitted origins for WebAuthn validation."""
        origins: list[str] = []
        if request:
            origin = request.headers.get("origin")
            if origin and origin not in origins:
                origins.append(origin.rstrip("/"))
            referer = request.headers.get("referer")
            if referer:
                parsed_ref = urlparse(referer)
                ref_origin = f"{parsed_ref.scheme}://{parsed_ref.netloc}"
                if ref_origin not in origins:
                    origins.append(ref_origin)

        # Always include the configured frontend base URL
        if settings.frontend_base_url:
            origins.append(settings.frontend_base_url.rstrip("/"))
        # Include all CORS-allowed origins
        for o in settings.allowed_origins_list:
            if o not in origins:
                origins.append(o)
        # Safety fallback for pure-local dev
        for dev_origin in (
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ):
            if dev_origin not in origins:
                origins.append(dev_origin)
        return origins

    # ==================== Registration ====================

    async def get_registration_options(self, user: User, request: Any = None) -> tuple[str, dict[str, Any]]:
        """Generate PublicKeyCredentialCreationOptions for the browser."""
        existing_passkeys = await self.passkey_repo.list_for_user(user.id)
        exclude_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.credential_id))
            for p in existing_passkeys
        ]

        options = generate_registration_options(
            rp_id=self._get_rp_id(request),
            rp_name=settings.webauthn_rp_name,
            user_id=str(user.id).encode("utf-8"),
            user_name=user.email,
            user_display_name=user.full_name or user.email,
            attestation=AttestationConveyancePreference.NONE,
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment=None,  # allows platform (Touch ID/Hello) or cross-platform (Yubikey)
                user_verification=UserVerificationRequirement.PREFERRED,
                resident_key=None,
            ),
            exclude_credentials=exclude_credentials,
        )

        challenge_id = await self.challenge_repo.save(
            challenge_b64=bytes_to_base64url(options.challenge),
            user_id=user.id,
        )
        options_json = json.loads(options_to_json(options))
        return str(challenge_id), options_json

    async def verify_registration(
        self, user: User, challenge_id: str, credential_payload: dict[str, Any], passkey_name: str, request: Any = None
    ) -> UserPasskey:
        """Verify attestation from browser and persist credential."""
        try:
            cid = uuid.UUID(challenge_id)
        except ValueError:
            raise BadRequestError("Invalid challenge ID format.")

        cached = await self.challenge_repo.pop(cid)
        if not cached:
            raise BadRequestError("Passkey registration challenge expired or invalid. Please try again.")

        if cached.user_id != user.id:
            raise UnauthorizedError("Challenge user mismatch.")

        expected_challenge = base64url_to_bytes(cached.challenge_b64)
        origins = self._get_rp_origins(request)

        try:
            verification = verify_registration_response(
                credential=credential_payload,
                expected_challenge=expected_challenge,
                expected_rp_id=self._get_rp_id(request),
                expected_origin=origins,
            )
        except Exception as exc:
            log.warning("passkey_reg_verify_failed", error=str(exc))
            raise BadRequestError(f"Passkey registration verification failed: {exc}")

        await self.session.commit()  # commit challenge deletion before writing passkey

        credential_id_str = bytes_to_base64url(verification.credential_id)
        public_key_str = bytes_to_base64url(verification.credential_public_key)

        # Check if already registered
        existing = await self.passkey_repo.get_by_credential_id(credential_id_str)
        if existing:
            raise ConflictError("This passkey is already registered.")

        from datetime import datetime
        passkey = UserPasskey(
            user_id=user.id,
            credential_id=credential_id_str,
            public_key=public_key_str,
            sign_count=verification.sign_count,
            name=passkey_name.strip() or "Device Passkey",
            last_used_at=datetime.now(timezone.utc),
        )
        await self.passkey_repo.create(passkey)
        return passkey

    # ==================== Authentication ====================

    async def get_authentication_options(self, request: Any = None) -> tuple[str, dict[str, Any]]:
        """Generate PublicKeyCredentialRequestOptions for passkey login."""
        options = generate_authentication_options(
            rp_id=self._get_rp_id(request),
            # REQUIRED: a PIN or biometric is mandatory, not just requested.
            # This prevents bare hardware keys with no UV from authenticating.
            user_verification=UserVerificationRequirement.REQUIRED,
        )
        challenge_id = await self.challenge_repo.save(
            challenge_b64=bytes_to_base64url(options.challenge),
            user_id=None,
        )
        options_json = json.loads(options_to_json(options))
        return str(challenge_id), options_json

    async def verify_authentication(
        self, challenge_id: str, credential_payload: dict[str, Any], request: Any = None
    ) -> tuple[User, str, str]:
        """Verify assertion signature and issue session tokens (access, refresh)."""
        try:
            cid = uuid.UUID(challenge_id)
        except ValueError:
            raise BadRequestError("Invalid challenge ID format.")

        cached = await self.challenge_repo.pop(cid)
        if not cached:
            raise BadRequestError("Passkey login session expired. Please click Passkey again.")

        await self.session.commit()  # commit challenge deletion before authentication

        expected_challenge = base64url_to_bytes(cached.challenge_b64)
        credential_id_raw = credential_payload.get("id") or credential_payload.get("rawId")
        if not credential_id_raw:
            raise BadRequestError("Invalid credential payload.")

        passkey = await self.passkey_repo.get_by_credential_id(credential_id_raw)
        if not passkey:
            raise UnauthorizedError("Passkey not recognized. Please register this passkey in your account first.")

        user = passkey.user
        if not user or not user.is_active:
            raise UnauthorizedError("Account disabled or not found.")

        origins = self._get_rp_origins(request)

        try:
            verification = verify_authentication_response(
                credential=credential_payload,
                expected_challenge=expected_challenge,
                expected_rp_id=self._get_rp_id(request),
                expected_origin=origins,
                credential_public_key=base64url_to_bytes(passkey.public_key),
                credential_current_sign_count=passkey.sign_count,
            )
        except Exception as exc:
            log.warning("passkey_auth_verify_failed", error=str(exc))
            raise UnauthorizedError(f"Passkey verification failed: {exc}")

        # Update sign count & usage timestamp
        await self.passkey_repo.update_usage(passkey, verification.new_sign_count)

        # Issue tokens using AuthService
        access, refresh, jti = self.auth_service._issue_tokens(user)
        user.last_refresh_jti = jti
        await self.user_repo.update(user)
        return user, access, refresh
