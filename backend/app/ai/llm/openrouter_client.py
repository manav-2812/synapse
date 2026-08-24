"""OpenRouter LLM client (third fallback provider)."""
import threading

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from app.ai.llm.groq_client import strip_think_block
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.openrouter")

_BASE_URL = "https://openrouter.ai/api/v1"
_MODEL = "openrouter/free"
_FALLBACK_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"
_MAX_TOKENS = 1024
_TEMPERATURE = 0.2
_TIMEOUT_SECONDS = 60

_client: AsyncOpenAI | None = None
_lock = threading.Lock()


def _require_api_key() -> None:
    """Fail before a network call when this optional provider is unconfigured."""
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not configured")


def _get_client() -> AsyncOpenAI:
    global _client
    _require_api_key()
    if _client is None:
        with _lock:
            if _client is None:
                _client = AsyncOpenAI(
                    api_key=settings.openrouter_api_key,
                    base_url=_BASE_URL,
                    timeout=_TIMEOUT_SECONDS,
                )
    return _client


def _messages(system: str, user: str) -> list[ChatCompletionMessageParam]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def complete(system: str, user: str, max_tokens: int | None = None) -> str:
    """Complete with the Free Models Router, then NVIDIA Nemotron free."""
    client = _get_client()
    tokens = max_tokens if max_tokens is not None else _MAX_TOKENS
    for model in (_MODEL, _FALLBACK_MODEL):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=tokens,
            )
            return strip_think_block(response.choices[0].message.content or "")
        except Exception as e:
            log.warning("openrouter_model_failed", model=model, error=str(e)[:200])
            if model == _FALLBACK_MODEL:
                raise
    return ""


async def stream(system: str, user: str, max_tokens: int | None = None):
    """Generate fully, then yield word-by-word like the Gemini fallback client."""
    text = await complete(system, user, max_tokens=max_tokens)
    for word in text.split(" "):
        yield word + " "
