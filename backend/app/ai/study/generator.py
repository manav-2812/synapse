"""Study-tool generation: Groq -> Gemini -> OpenRouter fallback + JSON extraction."""
import json
import re

from app.ai.llm import gemini_client, groq_client, openrouter_client
from app.ai.llm.groq_client import strip_think_block
from app.core.config import settings
from app.core.exceptions import ProcessingError
from app.core.logger import get_logger

log = get_logger("study.generator")


async def generate(system: str, user: str) -> str:
    """Return generated text, trying Groq, Gemini, then configured OpenRouter.

    Raises ProcessingError (clean 500) if neither provider can respond, rather
    than leaking a raw provider exception.
    """
    try:
        return await groq_client.complete(system, user)
    except Exception as e:
        log.warning("groq_complete_failed", error=str(e)[:300])
    try:
        return await gemini_client.complete(system, user)
    except Exception as e:
        log.warning("gemini_complete_failed", error=str(e)[:300])
    if settings.openrouter_api_key:
        try:
            return await openrouter_client.complete(system, user)
        except Exception as e:
            log.error("openrouter_complete_failed", error=str(e)[:300])
    raise ProcessingError(
        "The AI provider is unavailable right now. Please try again later."
    )


async def generate_structured(system: str, user: str) -> str:
    """Return generated text using the non-reasoning structured model (Groq),
    falling back to Gemini and then configured OpenRouter. Use this for quiz/flashcard/notes generation where
    <think> blocks in the output would corrupt JSON parsing.
    """
    try:
        return await groq_client.complete_structured(system, user)
    except Exception as e:
        log.warning("groq_structured_failed", error=str(e)[:300])
    try:
        return await gemini_client.complete(system, user)
    except Exception as e:
        log.warning("gemini_structured_failed", error=str(e)[:300])
    if settings.openrouter_api_key:
        try:
            return await openrouter_client.complete(system, user)
        except Exception as e:
            log.error("openrouter_structured_failed", error=str(e)[:300])
    raise ProcessingError(
        "The AI provider is unavailable right now. Please try again later."
    )


async def generate_json(system: str, user: str):
    """Return parsed JSON from Groq (structured), Gemini, then OpenRouter.

    Uses ``groq_client.complete_structured`` (openai/gpt-oss-20b) as the
    primary path so reasoning-model <think> blocks never contaminate the JSON.
    Falls back to the second provider when the first returns output that *isn't
    valid JSON* — not only on hard errors.
    """
    last_err: Exception | None = None

    # Groq structured first, Gemini second, optional OpenRouter third. Parsing
    # occurs per provider so malformed JSON also advances the fallback chain.
    providers = [
        (groq_client.complete_structured, "groq_structured"),
        (gemini_client.complete, "gemini"),
    ]
    if settings.openrouter_api_key:
        providers.append((openrouter_client.complete, "openrouter"))
    for call, label in providers:
        try:
            text = await call(system, user)
        except Exception as e:  # provider outage / rate limit
            log.warning("provider_failed", provider=label, error=str(e)[:300])
            last_err = e
            continue
        try:
            return extract_json(text)
        except ValueError as e:  # provider returned prose / malformed JSON
            log.warning(
                "provider_unparseable",
                provider=label,
                error=str(e)[:200],
                raw_preview=text[:300],
            )
            last_err = e
            continue
    raise ProcessingError(
        "The AI provider returned an unparseable response. Please try again."
    )


def _extract_bracket_block(text: str, open_ch: str, close_ch: str) -> str | None:
    """Return the first balanced ``open_ch ... close_ch`` block in ``text``.

    Respects nesting and skips brackets inside string literals, so a stray
    ``[`` or ``{`` in surrounding prose won't swallow the whole response.
    """
    start = text.find(open_ch)
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def extract_json(text: str):
    """Extract a JSON object or array from an LLM response.

    Processing order:
    1. Strip ``<think>...</think>`` reasoning blocks.
    2. Strip markdown code fences (```json ... ```).
    3. Try the whole cleaned string as JSON.
    4. Find the first balanced ``{...}`` or ``[...]`` block (ignores prose).
    5. Repair raw control chars inside string literals and retry.

    Raises ValueError with the first 500 chars of the raw text included so
    failures are diagnosable in logs.
    """
    raw = text  # keep original for error reporting
    # Step 1: strip think blocks before any other processing.
    cleaned = strip_think_block(text)
    # Step 2: strip markdown code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    else:
        cleaned = cleaned.strip()

    # Step 3+4: candidates — full cleaned string, then first balanced block.
    candidates = [cleaned]
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        block = _extract_bracket_block(cleaned, open_ch, close_ch)
        if block:
            candidates.append(block)

    for cand in candidates:
        try:
            return json.loads(cand)
        except json.JSONDecodeError:
            pass
    # Step 5: repair raw control chars inside string literals and retry.
    for cand in candidates:
        try:
            return json.loads(_repair_json(cand))
        except json.JSONDecodeError:
            continue
    raise ValueError(
        f"No valid JSON found in model response. "
        f"Raw text (first 500 chars): {raw[:500]!r}"
    )


def _repair_json(text: str) -> str:
    """Escape raw control characters (notably newlines/tabs) found inside JSON
    string literals so ``json.loads`` can parse model output that forgot to
    escape them. Leaves everything else (and strings that are already valid)
    untouched.
    """
    out: list[str] = []
    in_str = False
    esc = False
    for ch in text:
        if esc:
            out.append(ch)
            esc = False
            continue
        if ch == "\\":
            out.append(ch)
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            out.append(ch)
            continue
        if in_str:
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                out.append("\\r")
                continue
            if ch == "\t":
                out.append("\\t")
                continue
            if ord(ch) < 0x20:  # drop other control chars inside strings
                continue
        out.append(ch)
    return "".join(out)
