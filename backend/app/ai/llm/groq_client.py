"""Groq LLM client (primary provider)."""
import re
import threading

from groq import AsyncGroq
from groq.types.chat import ChatCompletionMessageParam

from ...core.config import settings
from ...core.logger import get_logger

log = get_logger("llm.groq")

# Primary model used for chat streaming.
_MODEL = "openai/gpt-oss-120b"
_FALLBACK_MODEL = "openai/gpt-oss-20b"

# Model used exclusively for structured JSON generation (quiz/flashcards/notes).
_STRUCTURED_MODEL = "openai/gpt-oss-20b"

_MAX_TOKENS = 2048
# Used only when the query needs a long-form answer — summaries, "explain in
# detail", multi-part questions — not applied to every query so normal chat
# stays fast and stays under Groq's free-tier TPM ceiling.
_MAX_TOKENS_LONG = 4096
_TEMPERATURE = 0.2

# Shorter timeout for streaming/primary use so the fallback chain kicks in fast
# rather than waiting the full 60s before trying Gemini.
_STREAM_TIMEOUT_SECONDS = 15
_COMPLETE_TIMEOUT_SECONDS = 30

_client = None
_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Think-block stripping
# ---------------------------------------------------------------------------
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
# Partial opening tag — used to hold back a potential think-block start
_THINK_OPEN_RE = re.compile(r"<think", re.IGNORECASE)


def strip_think_block(text: str) -> str:
    """Remove any <think>...</think> reasoning traces from a model response."""
    return _THINK_RE.sub("", text).strip()


# ---------------------------------------------------------------------------
# Client singletons (separate timeouts for streaming vs non-streaming)
# ---------------------------------------------------------------------------

_stream_client = None
_complete_client = None


def _get_stream_client() -> AsyncGroq:
    global _stream_client
    if _stream_client is None:
        with _lock:
            if _stream_client is None:
                _stream_client = AsyncGroq(
                    api_key=settings.groq_api_key,
                    timeout=_STREAM_TIMEOUT_SECONDS,
                )
    return _stream_client


def _get_complete_client() -> AsyncGroq:
    global _complete_client
    if _complete_client is None:
        with _lock:
            if _complete_client is None:
                _complete_client = AsyncGroq(
                    api_key=settings.groq_api_key,
                    timeout=_COMPLETE_TIMEOUT_SECONDS,
                )
    return _complete_client


def _messages(system: str, user: str) -> list[ChatCompletionMessageParam]:
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def complete(system: str, user: str, max_tokens: int | None = None) -> str:
    """Chat completion with primary → fallback model, think-block stripped."""
    client = _get_complete_client()
    tokens = max_tokens if max_tokens is not None else _MAX_TOKENS
    for model in (_MODEL, _FALLBACK_MODEL):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=tokens,
            )
            return strip_think_block(resp.choices[0].message.content or "")
        except Exception as e:
            log.warning("groq_model_failed", model=model, error=str(e)[:200])
            if model == _FALLBACK_MODEL:
                raise
    return ""


async def complete_structured(system: str, user: str, max_tokens: int | None = None) -> str:
    """Completion for structured JSON generation (quiz / flashcards / notes)."""
    client = _get_complete_client()
    tokens = max_tokens if max_tokens is not None else _MAX_TOKENS
    for model in (_STRUCTURED_MODEL, _MODEL):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=tokens,
            )
            return strip_think_block(resp.choices[0].message.content or "")
        except Exception as e:
            log.warning("groq_structured_model_failed", model=model, error=str(e)[:200])
            if model == _MODEL:
                raise
    return ""


async def stream(system: str, user: str, max_tokens: int | None = None):
    """True streaming: yield text chunks as they arrive from the API.

    Think-block suppression uses a hold-back buffer: text inside a potential
    <think> block is withheld until the closing </think> is seen (then
    discarded), or until the buffer clearly cannot be a think-block (then
    flushed). This avoids buffering the entire response.
    """
    client = _get_stream_client()
    tokens = max_tokens if max_tokens is not None else _MAX_TOKENS
    for model in (_MODEL, _FALLBACK_MODEL):
        try:
            response_stream = await client.chat.completions.create(
                model=model,
                messages=_messages(system, user),
                temperature=_TEMPERATURE,
                max_tokens=tokens,
                stream=True,
            )
            hold = ""          # buffer for potential <think> block
            in_think = False   # currently inside a <think> block

            async for chunk in response_stream:
                delta = chunk.choices[0].delta.content
                if not delta:
                    continue

                hold += delta

                while hold:
                    if in_think:
                        # Looking for </think>
                        end = hold.lower().find("</think>")
                        if end != -1:
                            hold = hold[end + len("</think>"):]
                            in_think = False
                        else:
                            # Keep buffering — the close tag may arrive in next chunk
                            # but cap the buffer to avoid unbounded growth
                            if len(hold) > 8192:
                                # Clearly not a real think block — flush it
                                yield hold
                                hold = ""
                                in_think = False
                            break
                    else:
                        # Not in a think block — look for opening <think
                        start = hold.lower().find("<think")
                        if start == -1:
                            # No think tag anywhere — yield everything
                            yield hold
                            hold = ""
                        elif start > 0:
                            # Yield the safe prefix before the potential tag
                            yield hold[:start]
                            hold = hold[start:]
                        else:
                            # hold starts with <think — check if tag is complete
                            gt = hold.find(">", 6)
                            if gt != -1:
                                # Full opening tag present — enter think mode
                                hold = hold[gt + 1:]
                                in_think = True
                            else:
                                # Incomplete tag — wait for more chunks
                                break

            # Flush anything left over that wasn't in a think block
            if hold and not in_think:
                yield hold.strip()
            return

        except Exception as e:
            log.warning("groq_stream_model_failed", model=model, error=str(e)[:200])
            if model == _FALLBACK_MODEL:
                raise
