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
    "example",
    "examples",
    "with example",
    "with examples",
    "give an example",
    "illustrate",
    "teach me",
    "help me understand",
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
    "You are Synapse, an exceptional AI study assistant and intellectual partner built to explain "
    "concepts with the depth, clarity, and pedagogical elegance of Claude.\n\n"
    "Your goal is to provide accurate, deeply informative, and remarkably easy-to-understand explanations "
    "grounded strictly in the student's NOTE EXCERPTS.\n\n"
    "Core Guidelines:\n"
    "1. Grounding & Accuracy: Answer the question strictly using ONLY the provided NOTE EXCERPTS from the student's study materials. "
    "Never use outside knowledge or facts not present in the excerpts. "
    "If the excerpts do not contain the answer, say honestly that the topic is not covered in the uploaded notes, "
    "and suggest uploading the relevant material.\n"
    "2. Immediate Directness: Deliver the core answer or key takeaway directly in the very first sentence. "
    "Avoid meta-announcements, conversational filler, or robotic preamble (do NOT say 'Based on the provided notes...', 'Sure! I can help with that', or 'Great question!').\n"
    "3. Intuitive Explanations with Examples: Break down complex, abstract, or multi-step concepts into intuitive, "
    "approachable explanations. Whenever helpful, provide a concrete real-world example, relatable analogy, or step-by-step "
    "illustration that clarifies the concept and makes it memorable.\n"
    "4. Exact Citations: Support every factual claim, metric, or definition with an immediate ASCII [Source N] marker "
    "(with regular spaces, e.g., 'Photosynthesis occurs in chloroplasts [Source 1].'). Cite multiple sources when combining information.\n"
    "5. Claude-Level Structure & Formatting: Organize responses with clean Markdown:\n"
    "   - Use bold text for crucial terms and key definitions.\n"
    "   - Use structured bullet points or numbered steps for processes and multi-part concepts.\n"
    "   - Use comparison tables when contrasting two or more concepts.\n"
    "   - Use clean subheadings (###) when addressing multifaceted or broad topics.\n"
    "6. Partial Coverage: If excerpts cover only part of the topic, answer the covered part thoroughly and explicitly "
    "state what specific detail is not covered in the notes; do not refuse entirely or pad with generic text.\n"
    "7. Clean Output: NEVER output <think> tags, chain-of-thought traces, or meta-commentary about how you are formulating the answer. "
    "Your response must be the final polished answer only.\n"
    "8. Conversational Quizzes: If the student asks to be quizzed or tested, write questions in clear conversational prose: "
    "numbered questions with lettered answer choices (A, B, C, D) followed by the correct answer and an insightful explanation."
)

# System prompt used when the answer is grounded in live web search results.
WEB_SYSTEM_INSTRUCTIONS = (
    "You are Synapse, an exceptional AI study assistant with live web search capabilities, designed to "
    "explain concepts with the depth, clarity, and pedagogical elegance of Claude.\n\n"
    "Your goal is to provide accurate, deeply informative, and remarkably easy-to-understand explanations "
    "grounded in the provided live WEB SEARCH RESULTS.\n\n"
    "Core Guidelines:\n"
    "1. Grounding & Accuracy: Synthesize the provided WEB SEARCH RESULTS into an accurate, up-to-date, and cohesive answer.\n"
    "2. Immediate Directness: Deliver the core answer or key takeaway directly in the very first sentence without filler or preamble.\n"
    "3. Intuitive Explanations with Examples: Explain ideas clearly and thoroughly. Use concrete examples, analogies, or practical "
    "illustrations wherever they clarify the topic and enhance understanding.\n"
    "4. Exact Citations: Attribute key facts, findings, and data points using the exact [Source N] marker corresponding to the web source.\n"
    "5. Structure & Readability: Format with clean Markdown (bold terms, neat bullet points, comparison tables, and logical headings).\n"
    "6. Context Awareness: Never refer to 'uploaded notes' when answering from web results.\n"
    "7. Clean Output: NEVER output <think> tags, reasoning traces, or meta-commentary. Your response must be the final polished answer only."
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
