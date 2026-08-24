"""Prompt builders for study-tool generation (notes, quizzes, flashcards)."""

NOTE_STYLES = {
    "short_notes": "concise bullet-point summary of the key ideas",
    "long_notes": "detailed, well-structured set of study notes with headings and explanations",
    "exam_answer": "a high-quality model answer as a student would write in an exam",
    "formula_sheet": "a compact sheet of the key formulas, definitions, and facts to memorise",
}

# ---------------------------------------------------------------------------
# Shared base system prompt for all study-tool generation.
# ---------------------------------------------------------------------------
SYSTEM_STUDY = (
    "You are Synapse, an AI study assistant. Use ONLY the provided NOTE EXCERPTS from the "
    "student's uploaded material. Never invent facts not present in the excerpts. "
    "Return ONLY the requested JSON object or array — no markdown fences, no prose, no "
    "commentary before or after. If no excerpts are provided, still return valid JSON with "
    "a short honest note in the content; do not explain in prose. "
    "CRITICAL: Never output <think> tags, chain-of-thought traces, reasoning narration, or "
    "any 'here is my approach' preamble. Your response must start immediately with the JSON."
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
        f"\nProduce {style}. "
        "Respond with a single JSON object: "
        '{"title": str, "content": str}. '
        "Use only facts, examples, and terminology present in the excerpts; do not add "
        "outside material to make the notes seem complete. For long_notes and exam_answer, "
        "organize the content with clear headings. "
        "The 'content' field must contain ONLY the final notes — no meta-commentary, "
        "no preamble like 'here are your notes', no <think> tags."
    )
    user = _context(chunks) + f"\nGenerate the {style}."
    return system, user


def build_quiz_prompt(difficulty: str, count: int, chunks: list[dict]) -> tuple[str, str]:
    system = SYSTEM_STUDY + (
        f"\nCreate a {difficulty}-difficulty assessment with {count} multiple-choice questions (MCQs) from the excerpts. "
        "ALL questions MUST be multiple-choice ('mcq') with exactly 4 options. Do NOT generate subjective or short-answer questions. "
        "Set 'correct_answer' to the exact text of the correct option. "
        "Every question and answer must be directly verifiable against the excerpts. "
        "Incorrect options must be plausible but contradicted by or unsupported by the excerpts. "
        "Each explanation must state which source excerpt supports the correct answer. "
        "Generate a descriptive, topic-specific title for this quiz based on the key subject matter (e.g. 'ITMS System Architecture & Security Quiz', 'Data Structures & Algorithmic Complexity Quiz').\n"
        "Output ONLY a valid JSON object matching this schema — no preamble, no markdown fences, no <think> tags:\n"
        '{\n'
        '  "title": "Specific Topic Quiz Title",\n'
        '  "questions": [\n'
        '    {"question_type":"mcq", "prompt":"...", "options":["Option 1", "Option 2", "Option 3", "Option 4"], "correct_answer":"Option 1", "explanation":"..."}\n'
        '  ]\n'
        '}\n'
        'If you cannot produce the schema for any reason, output {"error": "reason"} instead of prose.'
    )
    user = _context(chunks) + f"\nCreate {count} {difficulty} multiple-choice questions now with an informative topic title."
    return system, user


def build_flashcards_prompt(count: int, chunks: list[dict]) -> tuple[str, str]:
    system = SYSTEM_STUDY + (
        f"\nCreate {count} flashcards from the excerpts. Each has a 'front' (a term or question) "
        "and a 'back' (the definition or answer). Every front/back pair must be directly "
        "verifiable against a specific excerpt; do not invent facts. Do not create near-duplicate "
        "cards that test the same fact twice. Return fewer cards rather than pad or duplicate "
        "when the excerpts do not support the requested count.\n"
        "Output ONLY a valid JSON array matching this schema — no preamble, no markdown fences, "
        "no <think> tags, no explanation outside the JSON:\n"
        '[{"front":str,"back":str}]\n'
        'If you cannot produce the schema for any reason, output {"error": "reason"} instead of prose.'
    )
    user = _context(chunks) + f"\nCreate {count} flashcards now."
    return system, user
