"""Structured logging configuration (structlog)."""
import logging
import sys

import structlog

from app.core.config import settings

_CONFIGURED = False


def configure_logging() -> None:
    """Configure structlog + stdlib logging once."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_level = logging.DEBUG if settings.debug else logging.INFO
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _CONFIGURED = True


def get_logger(name: str = "synapse") -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger."""
    configure_logging()
    return structlog.get_logger(name)


# Module-level default logger
log = get_logger()
