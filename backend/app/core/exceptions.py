"""Custom application exceptions and FastAPI error handlers."""
import uuid
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logger import get_logger

log = get_logger("exceptions")


class SynapseError(Exception):
    """Base class for all expected application errors."""


class NotFoundError(SynapseError):
    """Resource not found (404)."""


class BadRequestError(SynapseError):
    """Bad client request (400)."""


class UnauthorizedError(SynapseError):
    """Missing or invalid credentials (401)."""


class ForbiddenError(SynapseError):
    """Authenticated but not allowed (403)."""


class ConflictError(SynapseError):
    """Resource conflict, e.g. duplicate email (409)."""


class ValidationError(SynapseError):
    """Business-level validation failure (422)."""


class ProcessingError(SynapseError):
    """Document processing or AI pipeline failure (500-ish)."""


def _error_body(message: str, code: str) -> dict:
    return {"error": {"message": message, "code": code}}


def parse_uuid(val: Any, name: str = "id") -> uuid.UUID:
    """Parse a string to uuid.UUID or raise BadRequestError with a clean message."""
    if not val:
        raise BadRequestError(f"Missing required identifier '{name}'.")
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError, AttributeError):
        raise BadRequestError(f"Invalid UUID format for '{name}': '{val}'.")


def parse_optional_uuid(val: Any, name: str = "id") -> uuid.UUID | None:
    """Parse an optional string to uuid.UUID or raise BadRequestError if provided and invalid."""
    if not val:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError, AttributeError):
        raise BadRequestError(f"Invalid UUID format for '{name}': '{val}'.")


def register_exception_handlers(app: FastAPI) -> None:
    """Attach global handlers so raw tracebacks never reach the client."""

    from pydantic import ValidationError as PydanticValidationError

    @app.exception_handler(PydanticValidationError)
    async def handle_pydantic(_: Request, exc: PydanticValidationError):
        # Should not normally happen (FastAPI validates responses), but if it
        # does we log detail and return a generic error instead of a traceback.
        log.error("response_validation_error", errors=exc.errors())
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("Response validation error.", "validation_error"),
        )

    @app.exception_handler(SynapseError)
    async def handle_synapse(_: Request, exc: SynapseError):
        if isinstance(exc, NotFoundError):
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=_error_body(str(exc) or "Not found", "not_found"),
            )
        if isinstance(exc, BadRequestError):
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=_error_body(str(exc) or "Bad request", "bad_request"),
            )
        if isinstance(exc, UnauthorizedError):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=_error_body(str(exc) or "Unauthorized", "unauthorized"),
            )
        if isinstance(exc, ForbiddenError):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content=_error_body(str(exc) or "Forbidden", "forbidden"),
            )
        if isinstance(exc, ConflictError):
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=_error_body(str(exc) or "Conflict", "conflict"),
            )
        if isinstance(exc, ValidationError):
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content=_error_body(str(exc) or "Validation error", "validation_error"),
            )
        # ProcessingError and base SynapseError
        log.error("synapse_error", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("An internal error occurred.", "internal_error"),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_body("Invalid request payload", "validation_error"),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(_: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == status.HTTP_404_NOT_FOUND else "http_error"
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(exc.detail if exc.detail else "HTTP Error", code),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception):
        log.error("unhandled_exception", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("An unexpected internal error occurred.", "internal_server_error"),
        )
