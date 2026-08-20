"""BM25 keyword index built per document collection, alongside Chroma.

This gives Synapse a lexical/sparse retrieval signal that complements the
dense semantic vector search. For keyword-heavy queries ("Einstein 1905
photoelectric") BM25 often out-ranks semantic search, so the two are blended
in :mod:`app.ai.rag.retriever`.
"""
import re
import threading
from collections.abc import Sequence

from rank_bm25 import BM25Okapi

from app.core.logger import get_logger

log = get_logger("rag.bm25")

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, return whitespace tokens."""
    return _TOKEN_RE.findall((text or "").lower())


class BM25Index:
    """Thin wrapper around ``rank_bm25.BM25Okapi`` keeping chunk ids in order."""

    def __init__(self, chunk_ids: Sequence[str], tokenized_docs: Sequence[Sequence[str]]) -> None:
        self.chunk_ids = list(chunk_ids)
        self.bm25 = BM25Okapi([list(t) for t in tokenized_docs]) if tokenized_docs else None

    def search(self, query: str, top_k: int) -> list[tuple[str, float]]:
        """Return ``(chunk_id, raw_bm25_score)`` pairs sorted best-first."""
        if self.bm25 is None or top_k <= 0:
            return []
        scores = self.bm25.get_scores(tokenize(query))
        ranked = sorted(zip(self.chunk_ids, scores), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


# Per-user cache so we don't rebuild the index on every query. Keyed by a
# (version) tuple so stale indexes are dropped when the collection changes.
_cache: dict[str, tuple[int, BM25Index, dict[str, dict]]] = {}
_cache_lock = threading.Lock()


def build_index(
    chunk_ids: Sequence[str], texts: Sequence[str]
) -> BM25Index:
    """Build a fresh BM25 index from chunk ids + raw texts."""
    return BM25Index(chunk_ids, [tokenize(t) for t in texts])


def get_or_build_index(
    user_id: str, chunks: list[dict]
) -> tuple[BM25Index, dict[str, dict]]:
    """Return a cached (or newly built) BM25 index and chunk map for the user."""
    chunk_count = len(chunks)
    with _cache_lock:
        if user_id in _cache:
            count, index, chunk_map = _cache[user_id]
            if count == chunk_count:
                return index, chunk_map
        chunk_map = {c["chunk_id"]: c for c in chunks}
        index = build_index([c["chunk_id"] for c in chunks], [c["text"] for c in chunks])
        _cache[user_id] = (chunk_count, index, chunk_map)
        return index, chunk_map
