"""Query pre-processing for project-specific terms.

Detects and auto-corrects near-miss spellings or voice-to-text mis-transcriptions
of known proper nouns (e.g., 'grab byte' -> 'GrabBite') before retrieval runs.
"""
from dataclasses import dataclass, field
from difflib import SequenceMatcher
import json
import os
from pathlib import Path
import re
from typing import List, Optional

from app.core.logger import get_logger

log = get_logger("query_correction")

DEFAULT_KNOWN_TERMS = [
    "GrabBite",
    "Synapse",
    "ChromaDB",
    "FastAPI",
    "PostgreSQL",
    "BM25",
    "Groq",
]

_TERMS_FILE = Path(__file__).resolve().parent.parent / "core" / "known_terms.json"
_CACHED_TERMS: list[str] = []
_LAST_MTIME: float = 0.0

COMMON_STOPWORDS = {
    "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by", "from",
    "is", "it", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "and", "or", "but", "if", "not", "so", "as", "what",
    "which", "who", "whom", "this", "that", "these", "those", "how", "why", "where",
    "when", "can", "could", "will", "would", "should", "all", "any", "some", "no",
}


@dataclass
class CorrectionItem:
    original: str
    corrected: str


@dataclass
class QueryCorrectionResult:
    original_query: str
    corrected_query: str
    was_corrected: bool = False
    corrections: list[CorrectionItem] = field(default_factory=list)


def load_known_terms() -> list[str]:
    """Load known proper noun terms with automatic mtime-based reload."""
    global _CACHED_TERMS, _LAST_MTIME
    try:
        if _TERMS_FILE.exists():
            mtime = os.path.getmtime(_TERMS_FILE)
            if mtime != _LAST_MTIME or not _CACHED_TERMS:
                with open(_TERMS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        _CACHED_TERMS = [str(t).strip() for t in data if str(t).strip()]
                        _LAST_MTIME = mtime
                        log.debug("known_terms_loaded", count=len(_CACHED_TERMS))
                return _CACHED_TERMS
    except Exception as exc:
        log.warning("load_known_terms_failed", error=str(exc)[:200])

    if not _CACHED_TERMS:
        _CACHED_TERMS = list(DEFAULT_KNOWN_TERMS)
    return _CACHED_TERMS


def _clean_str(text: str) -> str:
    """Strip all non-alphanumeric characters and lowercase."""
    return re.sub(r"[^a-zA-Z0-9]", "", text).lower()


def _levenshtein(s1: str, s2: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if s1 == s2:
        return 0
    if not s1:
        return len(s2)
    if not s2:
        return len(s1)

    v0 = list(range(len(s2) + 1))
    v1 = [0] * (len(s2) + 1)

    for i, c1 in enumerate(s1):
        v1[0] = i + 1
        for j, c2 in enumerate(s2):
            cost = 0 if c1 == c2 else 1
            v1[j + 1] = min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
        v0, v1 = v1, [0] * (len(s2) + 1)

    return v0[len(s2)]


def _is_similar(candidate_raw: str, term: str) -> tuple[bool, float]:
    """Determine if a candidate window is a near-miss of a known term."""
    clean_cand = _clean_str(candidate_raw)
    clean_term = _clean_str(term)

    if not clean_cand or not clean_term:
        return False, 0.0

    # If it's a single common stopword, never correct it to a term
    if clean_cand in COMMON_STOPWORDS and clean_cand != clean_term:
        return False, 0.0

    # Exact cleaned match (e.g. 'grab bite' -> 'grabbite' == 'grabbite', 'fast api' -> 'fastapi')
    if clean_cand == clean_term:
        # If the candidate was already the exact canonical term, no correction needed
        if candidate_raw.strip() == term:
            return False, 1.0
        return True, 1.0

    # Length difference guard: reject windows with extra leading/trailing words
    len_diff = abs(len(clean_cand) - len(clean_term))
    max_len_diff = 1 if len(clean_term) <= 7 else 2
    if len_diff > max_len_diff:
        return False, 0.0

    # Calculate edit distance & ratio
    dist = _levenshtein(clean_cand, clean_term)
    max_edits = 1 if len(clean_term) <= 6 else 2
    if dist > max_edits:
        return False, 0.0

    ratio = SequenceMatcher(None, clean_cand, clean_term).ratio()
    # High similarity threshold (>= 0.82)
    if ratio >= 0.82:
        return True, ratio

    return False, ratio


def correct_query(query: str, known_terms: Optional[list[str]] = None) -> QueryCorrectionResult:
    """Pre-process a search/chat query to correct near-miss proper nouns.

    Parameters
    ----------
    query : str
        The raw user query string.
    known_terms : list[str], optional
        Optional custom term list (defaults to loading known_terms.json).

    Returns
    -------
    QueryCorrectionResult
        The result containing the corrected query and metadata on applied corrections.
    """
    if not query or not query.strip():
        return QueryCorrectionResult(original_query=query, corrected_query=query)

    terms = known_terms if known_terms is not None else load_known_terms()
    if not terms:
        return QueryCorrectionResult(original_query=query, corrected_query=query)

    # Tokenize query preserving exact word boundaries and whitespace
    # Matches words with punctuation boundaries: [('What', 0, 4), ('is', 5, 7), ...]
    word_matches = list(re.finditer(r"[a-zA-Z0-9]+(?:'[a-zA-Z0-9]+)?", query))
    if not word_matches:
        return QueryCorrectionResult(original_query=query, corrected_query=query)

    candidates = []

    # Slide multi-word windows: 1-grams up to 3-grams
    for window_size in (1, 2, 3):
        for i in range(len(word_matches) - window_size + 1):
            first_match = word_matches[i]
            last_match = word_matches[i + window_size - 1]
            start_pos = first_match.start()
            end_pos = last_match.end()
            raw_window = query[start_pos:end_pos]

            for term in terms:
                is_match, score = _is_similar(raw_window, term)
                if is_match and raw_window.strip() != term:
                    span_indices = frozenset(range(i, i + window_size))
                    candidates.append({
                        "start_pos": start_pos,
                        "end_pos": end_pos,
                        "raw_window": raw_window,
                        "term": term,
                        "score": score,
                        "span_indices": span_indices,
                        "window_size": window_size,
                    })

    if not candidates:
        return QueryCorrectionResult(original_query=query, corrected_query=query)

    # Sort candidates by:
    # 1. score descending (exact clean matches 1.0 first)
    # 2. window_size (prefer tighter match when score is identical)
    candidates.sort(key=lambda c: (c["score"], -c["window_size"]), reverse=True)

    replacements: list[tuple[int, int, str, str]] = []
    matched_indices: set[int] = set()

    for cand in candidates:
        if not (cand["span_indices"] & matched_indices):
            replacements.append((
                cand["start_pos"],
                cand["end_pos"],
                cand["raw_window"],
                cand["term"],
            ))
            matched_indices.update(cand["span_indices"])

    if not replacements:
        return QueryCorrectionResult(original_query=query, corrected_query=query)

    # Sort replacements in reverse order of start position so replacements do not shift offsets
    replacements.sort(key=lambda r: r[0], reverse=True)
    corrected_chars = list(query)
    corrections: list[CorrectionItem] = []

    # Apply replacements from right to left so leftward indices stay stable
    for start_pos, end_pos, orig, corr in replacements:
        corrected_chars[start_pos:end_pos] = list(corr)
        corrections.append(CorrectionItem(original=orig, corrected=corr))

    # Keep corrections reported in natural left-to-right reading order
    corrections.reverse()
    corrected_query = "".join(corrected_chars)

    log.info(
        "query_corrected",
        original=query,
        corrected=corrected_query,
        corrections=[{"orig": c.original, "corr": c.corrected} for c in corrections],
    )

    return QueryCorrectionResult(
        original_query=query,
        corrected_query=corrected_query,
        was_corrected=True,
        corrections=corrections,
    )
