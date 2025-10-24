"""Token counting + cost estimation for LLM usage logging.

We estimate token counts locally with tiktoken (no extra API round-trip).
If tiktoken is unavailable we fall back to a chars/4 heuristic. Costs use the
public per-token prices declared in ``settings``.
"""
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("llm.tokens")

try:
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover - tiktoken optional at import time
    _ENC = None


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    if _ENC is not None:
        return len(_ENC.encode(text))
    return max(1, len(text) // 4)


def estimate_cost(provider: str, prompt_tokens: int, completion_tokens: int) -> float:
    if provider == "gemini":
        rate_in = settings.gemini_input_cost_per_1m
        rate_out = settings.gemini_output_cost_per_1m
    else:
        rate_in = settings.groq_input_cost_per_1m
        rate_out = settings.groq_output_cost_per_1m
    return (prompt_tokens / 1_000_000) * rate_in + (completion_tokens / 1_000_000) * rate_out
