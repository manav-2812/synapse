"""Gemini LLM client (fallback provider)."""
import asyncio
import threading

import google.generativeai as genai

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.gemini")

# Model name is read from settings so it can be overridden via GEMINI_MODEL env var.
# No module-level _MODEL constant — the value is locked in at first _configure() call.
_MAX_TOKENS = 4096
_TEMPERATURE = 0.2
_TIMEOUT_SECONDS = 60

_configured = False
_model = None
_lock = threading.Lock()


def _configure() -> None:
    global _configured, _model
    if not _configured:
        with _lock:
            if not _configured:
                genai.configure(api_key=settings.gemini_api_key)
                _model = genai.GenerativeModel(settings.gemini_model)
                _configured = True


async def complete(system: str, user: str, max_tokens: int | None = None) -> str:
    _configure()
    prompt = f"{system}\n\n{user}"
    tokens = max_tokens if max_tokens is not None else _MAX_TOKENS
    resp = await asyncio.to_thread(
        _model.generate_content,
        prompt,
        generation_config={
            "max_output_tokens": tokens,
            "temperature": _TEMPERATURE,
        },
        request_options={"timeout": _TIMEOUT_SECONDS},
    )
    return resp.text or ""


async def stream(system: str, user: str, max_tokens: int | None = None):
    """Fallback streaming: generate fully, then yield word-by-word."""
    text = await complete(system, user, max_tokens=max_tokens)
    for word in text.split(" "):
        yield word + " "
