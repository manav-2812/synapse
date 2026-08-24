"""Prompt construction for grounded RAG answers."""
import re

from app.core.constants import MessageRole

# ---------------------------------------------------------------------------
# Adaptive token-budget detection
# ---------------------------------------------------------------------------

# Keywords that reliably signal a long-form answer is needed.
# Extend this list freely — no restructuring required.
_LONG_FORM_KEYWORDS: tuple[str, ...] = (
    "summarize",
    "summary",
    "summarise",
    "summarisation",
    "summarization",
    "explain in detail",
    "explain in depth",
    "explain thoroughly",
    "in depth",
    "in-depth",
    "comprehensive",
    "comprehensively",
    "elaborate",
    "elaborate on",
    "walk me through",
    "walk through",
    "everything about",
    "tell me everything",
    "full explanation",
    "full breakdown",
    "detailed explanation",
    "detailed overview",
    "detailed summary",
    "give me a detailed",
    "provide a detailed",
    "write a detailed",
    "complete overview",
    "complete summary",
    "complete explanation",
    "compare and contrast",
    "pros and cons",
    "advantages and disadvantages",
    "step by step",
    "step-by-step",
    "all the key points",
    "all key points",
    "key points",
    "main points",
    "overview of",
    "break down",
    "breakdown of",
    "deep dive",
    "go through",
    "go over",
)

# Pre-compiled lowercase pattern — matched against the lowercased question so
# the check is a single regex pass, not N individual `in` tests.
_LONG_FORM_RE = re.compile(
    "|".join(re.escape(kw) for kw in _LONG_FORM_KEYWORDS),
    re.IGNORECASE,
)


def should_use_long_response(question: str) -> bool:
    """Return True when the question signals it needs a long-form answer.

    Heuristic — no LLM call, no latency added:
    - Keyword match against a curated list of long-form signals.
    - Multiple question marks (multi-part question).
    - Long question with "and" joining two clauses (≥12 words, contains " and ").

    Deliberately conservative: false negatives (short budget on a long question)
    are better than false positives (burning the long budget on every query and
    hitting Groq's free-tier TPM ceiling faster).
    """
    if not question:
        return False

    q = question.strip()

    # 1. Keyword match
    if _LONG_FORM_RE.search(q):
        return True

    # 2. Multiple question marks → multi-part question
    if q.count("?") >= 2:
        return True

    # 3. Long question (≥12 words) that joins two distinct asks with "and"
    words = q.split()
    if len(words) >= 12 and " and " in q.lower():
        return True

    return False

SYSTEM_INSTRUCTIONS = (
    "You are Synapse, an AI study assistant for a student. "
    "Answer the student's question STRICTLY using only the provided NOTE EXCERPTS "
    "from their uploaded study material. "
    "Rules:\n"
    "1. Never use outside knowledge or facts not present in the excerpts.\n"
    "2. If the excerpts do not contain the answer, say honestly that the topic is "
    "not covered in the uploaded notes, and suggest uploading the relevant material.\n"
    "3. Every factual claim must be immediately followed by the supporting exact ASCII "
    "[Source N] marker (with regular spaces); do not make uncited claims. Cite multiple "
    "sources for one claim when needed.\n"
    "4. Answer the actual question in the first sentence. Do not use filler such as "
    "'Great question' or an unnecessary introduction.\n"
    "5. If excerpts cover only part of the topic, answer the covered part and explicitly "
    "say what is missing; do not refuse entirely or pad with generic text.\n"
    "6. Be clear, accurate, and concise. Use bullet points for multi-part answers, and do "
    "not repeat the same point in different words to fill space.\n"
    "7. Match the student's level — explain concepts simply but precisely.\n"
    "8. NEVER output <think> tags, chain-of-thought reasoning, or any meta-commentary "
    "about how you are forming the answer. Your response must be the final answer only.\n"
    "9. Keep answers concise — prefer bullet points over long paragraphs.\n"
    "10. NEVER output raw JSON, code blocks, or structured data objects in your response. "
    "If the student asks to be quizzed or tested, write the questions in plain conversational "
    "prose: numbered questions with lettered answer choices (A, B, C, D) as plain text, "
    "followed by the correct answer and a brief explanation — no JSON, no code fences, "
    "no object syntax whatsoever."
)

# System prompt used when the answer is grounded in live web search results.
WEB_SYSTEM_INSTRUCTIONS = (
    "You are Synapse, an AI study assistant with live web search access. "
    "The user has requested to answer this question using live WEB SEARCH RESULTS. "
    "Rules:\n"
    "1. Answer the question comprehensively, clearly, and accurately using the provided WEB SEARCH RESULTS.\n"
    "2. Every key factual claim should be supported by referencing the relevant exact [Source N] marker.\n"
    "3. Structure your response clearly with concise explanations, bullet points, and bold terms where helpful.\n"
    "4. Answer the actual question in the very first sentence.\n"
    "5. NEVER say 'the uploaded notes do not contain' or mention uploaded documents when answering from the web.\n"
    "6. If the search results do not cover a specific detail, state what is known from the results accurately.\n"
    "7. NEVER output <think> tags, chain-of-thought reasoning, or meta-commentary. Your response must be the final answer only.\n"
    "8. NEVER output raw JSON or code blocks unless specifically requested."
)


def _format_context(chunks: list[dict]) -> str:
    if not chunks:
        return "(No relevant excerpts were found in the student's notes.)\n"
    parts = []
    for i, c in enumerate(chunks, 1):
        loc = f" (page {c['page_number']})" if c.get("page_number") else ""
        parts.append(f"[Source {i}]{loc}:\n{c['text']}\n")
    return "\n".join(parts)


def _format_web_context(results: list) -> str:
    """Format Tavily WebSearchResult objects for injection into the LLM prompt."""
    if not results:
        return "(No web search results were found.)\n"
    parts = []
    for i, r in enumerate(results, 1):
        date_str = f" (published: {r.published_date})" if getattr(r, "published_date", None) else ""
        parts.append(
            f"[Source {i}] {r.title}{date_str}\n"
            f"URL: {r.url}\n"
            f"{r.content}\n"
        )
    return "\n".join(parts)


def _format_history(history: list) -> str:
    from app.core.config import settings  # late import to avoid circular at module load

    window = settings.chat_history_window
    if not history:
        return ""
    lines = []
    for m in history[-window:]:
        role = "Student" if getattr(m, "role", None) == MessageRole.USER else "Synapse"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines)


def build_prompt(question: str, chunks: list[dict], history: list | None = None) -> tuple[str, str]:
    """Return (system_prompt, user_prompt)."""
    context = _format_context(chunks)
    system = SYSTEM_INSTRUCTIONS + "\n\n--- NOTE EXCERPTS ---\n" + context

    user = ""
    history_text = _format_history(history or [])
    if history_text:
        user += "Previous conversation:\n" + history_text + "\n\n"
    user += f"Student: {question}\nSynapse:"
    return system, user


def build_web_prompt(
    question: str, web_results: list, history: list | None = None
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for a web-search-grounded answer.

    Parameters
    ----------
    question:
        The raw user query.
    web_results:
        List of ``WebSearchResult`` objects from ``web_search_service.search()``.
    history:
        Conversation history (same as ``build_prompt``).
    """
    context = _format_web_context(web_results)
    system = WEB_SYSTEM_INSTRUCTIONS + "\n\n--- WEB SEARCH RESULTS ---\n" + context

    user = ""
    history_text = _format_history(history or [])
    if history_text:
        user += "Previous conversation:\n" + history_text + "\n\n"
    user += f"Student: {question}\nSynapse:"
    return system, user
