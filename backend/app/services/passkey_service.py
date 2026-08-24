"""Passkey (WebAuthn / FIDO2) registration and authentication service."""
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

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
    AuthenticatorAttachment,
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
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

log = get_logger("passkey")


class ChallengeStore:
    """In-memory challenge cache with 5-minute TTL for WebAuthn ceremony validation."""

    def __init__(self, ttl_seconds: int = 300) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._ttl = ttl_seconds

    def save(self, challenge: bytes, user_id: uuid.UUID | None = None) -> str:
        self._cleanup()
        cid = str(uuid.uuid4())
        self._store[cid] = {
            "challenge": bytes_to_base64url(challenge),
            "user_id": str(user_id) if user_id else None,
            "expires_at": time.time() + self._ttl,
        }
        return cid

    def pop(self, cid: str) -> dict[str, Any] | None:
        self._cleanup()
        return self._store.pop(cid, None)

    def _cleanup(self) -> None:
        now = time.time()
        expired = [k for k, v in self._store.items() if v["expires_at"] < now]
        for k in expired:
            self._store.pop(k, None)


# Singleton challenge store
challenge_store = ChallengeStore()


class PasskeyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.passkey_repo = PasskeyRepository(session)
        self.user_repo = UserRepository(session)
        self.auth_service = AuthService(session)

    def _get_rp_origins(self) -> list[str]:
        """Returns list of permitted origins for WebAuthn validation."""
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "https://synapse.vercel.app",
        ]
        if hasattr(settings, "allowed_origins_list"):
            for o in settings.allowed_origins_list:
                if o not in origins:
                    origins.append(o)
        return origins

    def _get_rp_id(self) -> str:
        """RP ID (must match the current domain / localhost)."""
        return "localhost"

    # ==================== Registration ====================

    async def get_registration_options(self, user: User) -> tuple[str, dict[str, Any]]:
        """Generate PublicKeyCredentialCreationOptions for the browser."""
        existing_passkeys = await self.passkey_repo.list_for_user(user.id)
        exclude_credentials = [
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.credential_id))
            for p in existing_passkeys
        ]

        options = generate_registration_options(
            rp_id=self._get_rp_id(),
            rp_name="Synapse",
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

        challenge_id = challenge_store.save(options.challenge, user.id)
        options_json = json.loads(options_to_json(options))
        return challenge_id, options_json

    async def verify_registration(
        self, user: User, challenge_id: str, credential_payload: dict[str, Any], passkey_name: str
    ) -> UserPasskey:
        """Verify attestation from browser and persist credential."""
        cached = challenge_store.pop(challenge_id)
        if not cached:
            raise BadRequestError("Passkey registration challenge expired or invalid. Please try again.")

        if cached.get("user_id") != str(user.id):
            raise UnauthorizedError("Challenge user mismatch.")

        expected_challenge = base64url_to_bytes(cached["challenge"])
        origins = self._get_rp_origins()

        # Find matching origin or default to localhost:5173
        client_origin = "http://localhost:5173"
        try:
            # webauthn verification
            verification = verify_registration_response(
                credential=credential_payload,
                expected_challenge=expected_challenge,
                expected_rp_id=self._get_rp_id(),
                expected_origin=origins,
            )
        except Exception as exc:
            log.warning("passkey_reg_verify_failed", error=str(exc))
            raise BadRequestError(f"Passkey registration verification failed: {exc}")

        credential_id_str = bytes_to_base64url(verification.credential_id)
        public_key_str = bytes_to_base64url(verification.credential_public_key)

        # Check if already registered
        existing = await self.passkey_repo.get_by_credential_id(credential_id_str)
        if existing:
            raise ConflictError("This passkey is already registered.")

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

    async def get_authentication_options(self) -> tuple[str, dict[str, Any]]:
        """Generate PublicKeyCredentialRequestOptions for passkey login."""
        options = generate_authentication_options(
            rp_id=self._get_rp_id(),
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        challenge_id = challenge_store.save(options.challenge)
        options_json = json.loads(options_to_json(options))
        return challenge_id, options_json

    async def verify_authentication(
        self, challenge_id: str, credential_payload: dict[str, Any]
    ) -> tuple[User, str, str]:
        """Verify assertion signature and issue session tokens (access, refresh)."""
        cached = challenge_store.pop(challenge_id)
        if not cached:
            raise BadRequestError("Passkey login session expired. Please click Passkey again.")

        expected_challenge = base64url_to_bytes(cached["challenge"])
        credential_id_raw = credential_payload.get("id") or credential_payload.get("rawId")
        if not credential_id_raw:
            raise BadRequestError("Invalid credential payload.")

        passkey = await self.passkey_repo.get_by_credential_id(credential_id_raw)
        if not passkey:
            raise UnauthorizedError("Passkey not recognized. Please register this passkey in your account first.")

        user = passkey.user
        if not user or not user.is_active:
            raise UnauthorizedError("Account disabled or not found.")

        origins = self._get_rp_origins()

        try:
            verification = verify_authentication_response(
                credential=credential_payload,
                expected_challenge=expected_challenge,
                expected_rp_id=self._get_rp_id(),
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
