"""BM25 keyword index built per document collection, alongside Chroma.

This gives Synapse a lexical/sparse retrieval signal that complements the
dense semantic vector search. For keyword-heavy queries ("Einstein 1905
photoelectric") BM25 often out-ranks semantic search, so the two are blended
in :mod:`app.ai.rag.retriever`.

Cache invalidation
------------------
The per-user in-memory cache stores a (chunk_count, content_hash, index, chunk_map)
tuple.  It is invalidated when either:

* the number of chunks changes (document added or deleted), OR
* a XOR-based content fingerprint of all chunk texts changes (document replaced
  with same-sized upload).

This prevents serving a stale BM25 index after a delete+re-upload cycle that
happens to produce the same chunk count.
"""
import hashlib
import re
import threading
from collections.abc import Sequence

from rank_bm25 import BM25Okapi

from app.core.logger import get_logger

log = get_logger("rag.bm25")

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, return alphanumeric tokens."""
    return _TOKEN_RE.findall((text or "").lower())


class BM25Index:
    """Thin wrapper around ``rank_bm25.BM25Okapi`` keeping chunk ids in order."""

    def __init__(
        self, chunk_ids: Sequence[str], tokenized_docs: Sequence[Sequence[str]]
    ) -> None:
        self.chunk_ids = list(chunk_ids)
        self.bm25 = BM25Okapi([list(t) for t in tokenized_docs]) if tokenized_docs else None

    def search(self, query: str, top_k: int) -> list[tuple[str, float]]:
        """Return ``(chunk_id, raw_bm25_score)`` pairs sorted best-first."""
        if self.bm25 is None or top_k <= 0:
            return []
        scores = self.bm25.get_scores(tokenize(query))
        ranked = sorted(zip(self.chunk_ids, scores), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]


# Per-user cache.  Each entry: (chunk_count, content_hash, BM25Index, chunk_map).
_CacheEntry = tuple[int, str, BM25Index, dict[str, dict]]
_cache: dict[str, _CacheEntry] = {}
_cache_lock = threading.Lock()


def _content_hash(chunks: list[dict]) -> str:
    """A fast content fingerprint: MD5 of all chunk_id strings concatenated.

    chunk_ids are UUIDs generated at ingest time, so replacing a document
    produces new IDs even when the chunk count stays the same — this catches
    that stale-cache case without hashing every text body.
    """
    h = hashlib.md5(usedforsecurity=False)
    for c in chunks:
        h.update((c.get("chunk_id") or "").encode())
    return h.hexdigest()


def build_index(chunk_ids: Sequence[str], texts: Sequence[str]) -> BM25Index:
    """Build a fresh BM25 index from chunk ids + raw texts."""
    return BM25Index(chunk_ids, [tokenize(t) for t in texts])


def peek_cache(user_id: str) -> tuple[BM25Index, dict[str, dict]] | None:
    """Return the cached (index, chunk_map) without touching Chroma, or None.

    Used by the retriever to skip the expensive Chroma full-scan when the
    cache is known to be current.  Returns None if no cache entry exists.
    """
    with _cache_lock:
        entry = _cache.get(user_id)
        if entry is None:
            return None
        _, _, index, chunk_map = entry
        return index, chunk_map


def get_or_build_index(
    user_id: str, chunks: list[dict]
) -> tuple[BM25Index, dict[str, dict]]:
    """Return a cached (or newly built) BM25 index and chunk map for the user.

    Invalidates the cache when chunk count or content fingerprint changes so
    stale indexes are not served after a document is replaced.
    """
    chunk_count = len(chunks)
    fingerprint = _content_hash(chunks)
    with _cache_lock:
        entry = _cache.get(user_id)
        if entry is not None:
            cached_count, cached_fp, index, chunk_map = entry
            if cached_count == chunk_count and cached_fp == fingerprint:
                return index, chunk_map
        # Build a fresh index.
        chunk_map = {c["chunk_id"]: c for c in chunks}
        index = build_index([c["chunk_id"] for c in chunks], [c["text"] for c in chunks])
        _cache[user_id] = (chunk_count, fingerprint, index, chunk_map)
        return index, chunk_map


def invalidate(user_id: str) -> None:
    """Explicitly drop a user's cached BM25 index (e.g. after document deletion)."""
    with _cache_lock:
        _cache.pop(user_id, None)
