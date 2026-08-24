"""Response generation with automatic Groq -> Gemini -> OpenRouter fallback.

Yields tagged events so the caller can (a) stream tokens to the client and
(b) record which provider actually answered (for cost/usage logging):

    ("provider", "groq" | "gemini" | "openrouter")
    ("token", "<text chunk>")
"""
from app.ai.llm import gemini_client, groq_client, openrouter_client
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.generator")


async def stream_answer(system: str, user: str, max_tokens: int | None = None):
    """Yield provider/token events: Groq first, then Gemini, then OpenRouter.

    Groq uses a 15s timeout so failure is detected quickly and the fallback
    chain kicks in without a 60s wait.  ``max_tokens`` is threaded through to
    whichever provider actually answers — None means each provider uses its
    own default (fully backward-compatible).
    """
    groq_chunks = 0
    try:
        async for chunk in groq_client.stream(system, user, max_tokens=max_tokens):
            if groq_chunks == 0:
                yield ("provider", "groq")
            groq_chunks += 1
            yield ("token", chunk)
        if groq_chunks > 0:
            return  # Groq delivered a complete response
    except Exception as e:
        log.warning("groq_stream_failed", error=str(e)[:300])

    # Groq either failed outright or returned nothing — try Gemini.
    # If Groq emitted some tokens before failing, warn the user inline.
    if groq_chunks > 0:
        yield (
            "token",
            "\n\n_(Note: the response was interrupted. Please retry if it looks incomplete.)_",
        )
        return

    gemini_chunks = 0
    try:
        async for chunk in gemini_client.stream(system, user, max_tokens=max_tokens):
            if gemini_chunks == 0:
                yield ("provider", "gemini")
            gemini_chunks += 1
            yield ("token", chunk)
        if gemini_chunks > 0:
            return
    except Exception as e:
        log.warning("gemini_stream_failed", error=str(e)[:300])

    if gemini_chunks > 0:
        yield (
            "token",
            "\n\n_(Note: the response was interrupted. Please retry if it looks incomplete.)_",
        )
        return

    if settings.openrouter_api_key:
        try:
            openrouter_chunks = 0
            async for chunk in openrouter_client.stream(system, user, max_tokens=max_tokens):
                if openrouter_chunks == 0:
                    yield ("provider", "openrouter")
                openrouter_chunks += 1
                yield ("token", chunk)
            if openrouter_chunks > 0:
                return
        except Exception as e:
            log.error("openrouter_stream_failed", error=str(e)[:300])

    yield (
        "token",
        "I'm sorry — I couldn't generate a response right now. "
        "Please check your connection and try again.",
    )
