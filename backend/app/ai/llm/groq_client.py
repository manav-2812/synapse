"""Groq LLM client (primary provider)."""
import re
import threading

from groq import AsyncGroq
from groq.types.chat import ChatCompletionMessageParam

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.groq")

# Primary model used for chat streaming.
_MODEL = "openai/gpt-oss-120b"
_FALLBACK_MODEL = "openai/gpt-oss-20b"

# Model used exclusively for structured JSON generation (quiz/flashcards/notes).
# Must be a non-reasoning model so <think> blocks never contaminate JSON output.
_STRUCTURED_MODEL = "openai/gpt-oss-20b"  # Fast, non-reasoning model for clean JSON (quizzes/flashcards/notes)

_MAX_TOKENS = 2048  # Sufficient for structured output without exceeding TPM ceilings
_TEMPERATURE = 0.2
_TIMEOUT_SECONDS = 60

_client = None
_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Think-block stripping
# ---------------------------------------------------------------------------
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def strip_think_block(text: str) -> str:
    """Remove any <think>...</think> reasoning traces from a model response.

    Applied unconditionally to every response so callers never see reasoning
    narration regardless of which underlying model produced the output.
    """
    return _THINK_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Client singleton
# ---------------------------------------------------------------------------

def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                _client = AsyncGroq(api_key=settings.groq_api_key, timeout=_TIMEOUT_SECONDS)
    return _client


def _messages(system: str, user: str) -> list[ChatCompletionMessageParam]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def complete(system: str, user: str) -> str:
    """Chat completion with primary → fallback model, think-block stripped."""
    client = _get_client()
    for model in (_MODEL, _FALLBACK_MODEL):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
            )
            return strip_think_block(resp.choices[0].message.content or "")
        except Exception as e:
            log.warning("groq_model_failed", model=model, error=str(e)[:200])
            if model == _FALLBACK_MODEL:
                raise
    return ""


async def complete_structured(system: str, user: str) -> str:
    """Completion for structured JSON generation (quiz / flashcards / notes).

    Uses ``_STRUCTURED_MODEL`` (qwen/qwen3-32b) — a non-reasoning
    model — so <think> blocks can never corrupt the JSON output.  Falls back
    to the chat primary model only on hard errors.
    """
    client = _get_client()
    for model in (_STRUCTURED_MODEL, _MODEL):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
            )
            return strip_think_block(resp.choices[0].message.content or "")
        except Exception as e:
            log.warning("groq_structured_model_failed", model=model, error=str(e)[:200])
            if model == _MODEL:
                raise
    return ""


async def stream(system: str, user: str):
    """Streaming chat completion, think-block stripped from every chunk."""
    client = _get_client()
    for model in (_MODEL, _FALLBACK_MODEL):
        try:
            response_stream = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=_MAX_TOKENS,
                stream=True,
            )
            # Accumulate chunks, strip think blocks from the aggregated buffer,
            # then yield. For streaming we do a best-effort strip: we collect
            # all chunks, strip once, then yield the cleaned text as a single
            # chunk. This prevents a <think> block that spans multiple chunks
            # from being partially emitted before it can be stripped.
            buffer: list[str] = []
            async for chunk in response_stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    buffer.append(delta)
            cleaned = strip_think_block("".join(buffer))
            if cleaned:
                yield cleaned
            return
        except Exception as e:
            log.warning("groq_stream_model_failed", model=model, error=str(e)[:200])
            if model == _FALLBACK_MODEL:
                raise
