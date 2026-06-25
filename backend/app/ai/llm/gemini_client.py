"""Gemini LLM client (fallback provider)."""
import asyncio
import threading

import google.generativeai as genai

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.gemini")

_MODEL = "gemini-2.5-flash"
_MAX_TOKENS = 2048
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
                _model = genai.GenerativeModel(_MODEL)
                _configured = True


async def complete(system: str, user: str) -> str:
    _configure()
    prompt = f"{system}\n\n{user}"
    resp = await asyncio.to_thread(
        _model.generate_content,
        prompt,
        generation_config={
            "max_output_tokens": _MAX_TOKENS,
            "temperature": _TEMPERATURE,
        },
        request_options={"timeout": _TIMEOUT_SECONDS},
    )
    return resp.text or ""


async def stream(system: str, user: str):
    """Fallback streaming: generate fully, then yield word-by-word."""
    text = await complete(system, user)
    for word in text.split(" "):
        yield word + " "
