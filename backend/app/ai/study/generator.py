"""Study-tool generation: Groq -> Gemini fallback + robust JSON extraction."""
import json
import re

from app.ai.llm import gemini_client, groq_client
from app.core.exceptions import ProcessingError
from app.core.logger import get_logger

log = get_logger("study.generator")


async def generate(system: str, user: str) -> str:
    """Return generated text, trying Groq then Gemini.

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
        log.error("study_generate_failed", error=str(e)[:300])
        raise ProcessingError(
            "The AI provider is unavailable right now. Please try again later."
        )


async def generate_json(system: str, user: str):
    """Return parsed JSON from the model, trying Groq then Gemini.

    Unlike :func:`generate`, this falls back to the second provider when the
    first returns output that *isn't valid JSON* — not only on hard errors.
    Previously a single unparseable Groq response surfaced a 500 instead of
    retrying on Gemini (the fallback only triggered on exceptions).
    """
    last_err: Exception | None = None
    for provider in (groq_client, gemini_client):
        try:
            text = await provider.complete(system, user)
        except Exception as e:  # provider outage / rate limit
            log.warning("provider_failed", provider=provider.__name__, error=str(e)[:300])
            last_err = e
            continue
        try:
            return extract_json(text)
        except ValueError as e:  # provider returned prose / malformed JSON
            log.warning(
                "provider_unparseable", provider=provider.__name__, error=str(e)[:120]
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
    """Extract a JSON object or array from an LLM response (handles code fences).

    Raises ValueError if no valid JSON can be found — callers should convert
    that into a clean ProcessingError rather than surfacing a raw 500.
    """
    cleaned = text.strip()
    # Strip markdown code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()

    # Candidate strings, in priority order: the whole thing, then the first
    # balanced { ... } / [ ... ] block (which ignores surrounding prose).
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
    # Last resort: some models emit raw newlines/tabs inside JSON string
    # literals (instead of escaped \n). Repair those and try once more.
    for cand in candidates:
        try:
            return json.loads(_repair_json(cand))
        except json.JSONDecodeError:
            continue
    raise ValueError("No valid JSON found in model response")


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
