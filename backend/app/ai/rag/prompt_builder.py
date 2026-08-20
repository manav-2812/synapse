"""Prompt construction for grounded RAG answers."""
from app.core.constants import MessageRole

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
    "9. Keep answers concise — prefer bullet points over long paragraphs."
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
    if not history:
        return ""
    lines = []
    for m in history[-3:]:
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
