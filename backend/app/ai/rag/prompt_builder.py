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


def _format_context(chunks: list[dict]) -> str:
    if not chunks:
        return "(No relevant excerpts were found in the student's notes.)\n"
    parts = []
    for i, c in enumerate(chunks, 1):
        loc = f" (page {c['page_number']})" if c.get("page_number") else ""
        parts.append(f"[Source {i}]{loc}:\n{c['text']}\n")
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
