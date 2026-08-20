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


async def stream_answer(system: str, user: str):
    """Yield provider/token events: Groq, Gemini, then configured OpenRouter."""
    emitted = 0
    provider = None
    try:
        async for chunk in groq_client.stream(system, user):
            if provider is None:
                provider = "groq"
                yield ("provider", provider)
            emitted += 1
            yield ("token", chunk)
        return
    except Exception as e:  # network/quota/any failure -> fallback
        log.warning("groq_stream_failed", error=str(e)[:300])

    if emitted > 0:
        yield (
            "token",
            "\n\n_(Note: the response was interrupted partway through. "
            "Please retry if it looks incomplete.)_",
        )
        return

    gemini_emitted = 0
    try:
        async for chunk in gemini_client.stream(system, user):
            if provider is None:
                provider = "gemini"
                yield ("provider", provider)
            gemini_emitted += 1
            yield ("token", chunk)
        return
    except Exception as e:
        log.warning("gemini_stream_failed", error=str(e)[:300])

    if gemini_emitted > 0:
        yield (
            "token",
            "\n\n_(Note: the response was interrupted partway through. "
            "Please retry if it looks incomplete.)_",
        )
        return

    if settings.openrouter_api_key:
        try:
            async for chunk in openrouter_client.stream(system, user):
                if provider is None:
                    provider = "openrouter"
                    yield ("provider", provider)
                yield ("token", chunk)
            return
        except Exception as e:
            log.error("openrouter_stream_failed", error=str(e)[:300])

    yield (
        "token",
        "I'm sorry — I couldn't generate a response right now. "
        "Please check your connection and try again.",
    )
