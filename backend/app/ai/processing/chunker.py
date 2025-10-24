"""Chunk cleaned document text into token pieces, keeping page metadata."""
import re

from app.ai.processing.text_cleaner import clean_text

# all-MiniLM-L6-v2 has max_seq_length=256. Keep chunks safely under that so the
# embedder never silently truncates text. A 500-token chunk previously lost
# roughly half its tokens to truncation, making that content unretrievable.
CHUNK_TOKENS = 240
CHUNK_OVERLAP = 40
_FALLBACK_CHARS_PER_TOKEN = 4

try:
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")
except Exception:  # pragma: no cover - tiktoken optional at import time
    _ENC = None


def _count_tokens(text: str) -> int:
    if _ENC is not None:
        return len(_ENC.encode(text))
    return max(1, len(text) // _FALLBACK_CHARS_PER_TOKEN)


def _split_text(text: str, max_tokens: int, overlap: int) -> list[str]:
    """Split a single (possibly long) text into token-bounded pieces."""
    if _count_tokens(text) <= max_tokens:
        return [text] if text.strip() else []

    sentences = re.split(r"(?<=[.!?])\s+", text)
    pieces: list[str] = []
    current = ""
    for sent in sentences:
        if not sent.strip():
            continue
        if current and _count_tokens(current + " " + sent) > max_tokens:
            pieces.append(current.strip())
            overlap_text = current[-overlap * _FALLBACK_CHARS_PER_TOKEN :] if overlap else ""
            current = (overlap_text + " " + sent).strip()
        else:
            current = (current + " " + sent).strip() if current else sent.strip()
    if current.strip():
        pieces.append(current.strip())
    return pieces


def _hard_window(pieces: list[str], max_tokens: int, overlap: int) -> list[str]:
    """Guarantee no piece exceeds ``max_tokens`` by char-windowing oversized runs.

    Sentence splitting alone leaves very long unpunctuated runs (OCR output,
    slide bullets, code, tables) as a single oversized piece, which the
    embedder would silently truncate — making that content unretrievable.
    Window those runs into bounded, overlapping pieces.
    """
    out: list[str] = []
    step = max(1, int(max_tokens * _FALLBACK_CHARS_PER_TOKEN * 0.9))
    overlap_chars = overlap * _FALLBACK_CHARS_PER_TOKEN if overlap else 0
    for p in pieces:
        if _count_tokens(p) <= max_tokens:
            out.append(p)
            continue
        start = 0
        n = len(p)
        while start < n:
            end = min(n, start + step)
            seg = p[start:end].strip()
            if seg:
                out.append(seg)
            start = end - overlap_chars
            if start >= end:  # safety against zero/negative progress
                start = end
    return out


def chunk_document(
    pages: list[tuple[int, str]],
    chunk_tokens: int = CHUNK_TOKENS,
    overlap: int = CHUNK_OVERLAP,
) -> list[dict]:
    """Return list of {text, page_number, token_count} chunks."""
    chunks: list[dict] = []
    index = 0
    for page_number, raw in pages:
        cleaned = clean_text(raw)
        if not cleaned:
            continue
        for piece in _hard_window(_split_text(cleaned, chunk_tokens, overlap), chunk_tokens, overlap):
            if not piece.strip():
                continue
            chunks.append(
                {
                    "text": piece,
                    "page_number": page_number,
                    "token_count": _count_tokens(piece),
                    "chunk_index": index,
                }
            )
            index += 1
    return chunks
