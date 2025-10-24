"""Groq LLM client (primary provider)."""
import threading

from groq import AsyncGroq

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.groq")

_MODEL = "llama-3.3-70b-versatile"
_MAX_TOKENS = 2048
_TEMPERATURE = 0.2
_TIMEOUT_SECONDS = 60

_client = None
_lock = threading.Lock()


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = AsyncGroq(api_key=settings.groq_api_key, timeout=_TIMEOUT_SECONDS)
    return _client


def _messages(system: str, user: str) -> list[dict]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def complete(system: str, user: str) -> str:
    resp = await _get_client().chat.completions.create(
        model=_MODEL,
        messages=_messages(system, user),
        temperature=_TEMPERATURE,
        max_tokens=_MAX_TOKENS,
    )
    return resp.choices[0].message.content or ""


async def stream(system: str, user: str):
    stream = await _get_client().chat.completions.create(
        model=_MODEL,
        messages=_messages(system, user),
        temperature=_TEMPERATURE,
        max_tokens=_MAX_TOKENS,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
