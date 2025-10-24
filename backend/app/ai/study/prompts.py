"""Prompt builders for study-tool generation (notes, quizzes, flashcards)."""

NOTE_STYLES = {
    "short_notes": "concise bullet-point summary of the key ideas",
    "long_notes": "detailed, well-structured set of study notes with headings and explanations",
    "exam_answer": "a high-quality model answer as a student would write in an exam",
    "formula_sheet": "a compact sheet of the key formulas, definitions, and facts to memorise",
}

SYSTEM_STUDY = (
    "You are Synapse, an AI study assistant. Use ONLY the provided NOTE EXCERPTS from the "
    "student's uploaded material. Never invent facts not present in the excerpts. "
    "Return ONLY the requested JSON object or array — no markdown fences, no prose, no "
    "commentary before or after. If no excerpts are provided, still return valid JSON with "
    "a short honest note in the content; do not explain in prose."
)


def _context(chunks: list[dict]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        loc = f" (page {c['page_number']})" if c.get("page_number") else ""
        parts.append(f"[Source {i}]{loc}:\n{c['text']}\n")
    return "\n".join(parts) if parts else "(No excerpts available.)\n"


def build_note_prompt(note_type: str, chunks: list[dict]) -> tuple[str, str]:
    style = NOTE_STYLES.get(note_type, NOTE_STYLES["short_notes"])
    system = SYSTEM_STUDY + (
        f"\nProduce {style}. Respond with a single JSON object: "
        '{"title": str, "content": str}.'
    )
    user = _context(chunks) + f"\nGenerate the {style}."
    return system, user


def build_quiz_prompt(difficulty: str, count: int, chunks: list[dict]) -> tuple[str, str]:
    system = SYSTEM_STUDY + (
        f"\nCreate {count} {difficulty}-difficulty quiz questions from the excerpts. "
        "Mix multiple-choice (mcq) and short-answer questions. For mcq, provide 3-4 options "
        "and set correct_answer to the exact option text. For short_answer, leave options empty "
        "and set correct_answer to a concise reference answer.\n"
        'Respond with a JSON array of objects: '
        '[{"question_type":"mcq|short_answer","prompt":str,"options":[str],'
        '"correct_answer":str,"explanation":str}].'
    )
    user = _context(chunks) + f"\nCreate {count} {difficulty} questions now."
    return system, user


def build_flashcards_prompt(count: int, chunks: list[dict]) -> tuple[str, str]:
    system = SYSTEM_STUDY + (
        f"\nCreate {count} flashcards from the excerpts. Each has a 'front' (a term or question) "
        "and a 'back' (the definition or answer).\n"
        'Respond with a JSON array of objects: [{"front":str,"back":str}].'
    )
    user = _context(chunks) + f"\nCreate {count} flashcards now."
    return system, user
