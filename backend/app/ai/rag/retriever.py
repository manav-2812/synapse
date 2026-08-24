"""Hybrid retrieval: semantic vector search blended with BM25 keyword search.

For every query we run dense (Chroma) and sparse (BM25) retrieval, normalize
both to 0..1, then combine with tunable weights from settings:

    score = w_semantic * semantic_norm + w_bm25 * bm25_norm

The merged candidate set is re-ranked and the top-k returned. This catches
keyword-heavy queries ("Einstein 1905 photoelectric") that pure semantic
search can mis-rank. When ``query`` (raw text) is not supplied the BM25 branch
is skipped and the function degrades to pure semantic search.

Normalization notes
-------------------
* Semantic: Chroma returns L2 distance. We convert to similarity via
  ``1 - distance/2`` (absolute, anchored: distance=0 → score=1.0).
* BM25: raw BM25Okapi scores are min-max normalized *within the candidate set*
  to 0..1.  To keep both signals on a comparable scale we use *soft-max*
  normalization for BM25: if the max raw score is effectively zero (< 1e-6)
  the whole BM25 branch contributes nothing, avoiding artificial inflation of
  zero-match candidates.  When the corpus is small and all BM25 candidates tie
  equally (min==max), we map them all to 0.5 rather than 0.0 so the tie is
  preserved relative to the semantic signal.

Minimum-score filtering
-----------------------
Chunks that don't clear ``settings.relevance_threshold`` are excluded before
they reach the LLM.  This is the primary fix for "random-seeming" answers:
weakly-relevant chunks are discarded rather than injected into the prompt.
"""
from app.ai.rag import bm25 as bm25_mod
from app.ai.vectorstore import chroma_client
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("rag.retriever")


def _normalize_distance(distance: float | None) -> float:
    """Chroma L2 distance → 0..1 similarity (anchored: 0 dist = 1.0)."""
    if distance is None:
        return 0.0
    return max(0.0, 1.0 - float(distance) / 2.0)


def _minmax_bm25(values: list[float]) -> list[float]:
    """Normalize BM25 raw scores to 0..1.

    * All-zero scores → all 0.0 (no BM25 signal in this query).
    * All equal non-zero scores → all 0.5 (tie preserved, not collapsed to 0).
    * Normal case → standard min-max.
    """
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi < 1e-6:
        # All scores are effectively zero — BM25 found nothing relevant.
        return [0.0] * len(values)
    if hi - lo < 1e-9:
        # All scores identical (and non-zero) — map to mid-point.
        return [0.5] * len(values)
    return [(v - lo) / (hi - lo) for v in values]


async def _semantic_search(
    query_vector: list[float],
    user_id: str,
    top_k: int,
    document_scope: list[str] | None,
) -> list[dict]:
    factor = settings.retrieval_candidate_factor
    raw = await chroma_client.query_chunks(
        user_id, query_vector, top_k=top_k * factor, document_scope=document_scope
    )
    raw.sort(key=lambda r: r["distance"] if r["distance"] is not None else float("inf"))
    return [
        {
            "chunk_id": r["chunk_id"],
            "text": r["text"],
            "page_number": r["page_number"],
            "document_id": r["document_id"],
            "distance": r["distance"],
            "score": _normalize_distance(r["distance"]),
        }
        for r in raw
    ]


async def _bm25_search(
    user_id: str, query: str, top_k: int, document_scope: list[str] | None
) -> tuple[list[tuple[str, float]], dict[str, dict]]:
    """Build (or reuse) the per-user BM25 index and score the query.

    The cache check happens before the expensive Chroma full-scan so repeated
    queries never re-fetch all chunks unnecessarily.
    """
    # Check cache first — avoid the full Chroma scan when index is current.
    cached = bm25_mod.peek_cache(user_id)
    if cached is not None:
        index, chunk_map = cached
    else:
        chunks = await chroma_client.get_all_chunks(user_id)
        if not chunks:
            return [], {}
        index, chunk_map = bm25_mod.get_or_build_index(user_id, chunks)

    factor = settings.retrieval_candidate_factor
    ranked = index.search(query, top_k=top_k * factor)
    if document_scope:
        scope = {str(d) for d in document_scope}
        ranked = [
            (cid, s)
            for cid, s in ranked
            if str(chunk_map.get(cid, {}).get("document_id", "")) in scope
        ]
    return ranked, chunk_map


async def retrieve(
    query_vector: list[float],
    user_id: str,
    top_k: int = 5,
    document_scope: list[str] | None = None,
    query: str | None = None,
) -> list[dict]:
    """Return the top_k chunks blended from semantic + BM25 signals.

    Pass ``query`` (the raw query text) to enable the BM25 branch; omit it for
    pure semantic retrieval.  Chunks that don't meet ``settings.relevance_threshold``
    are filtered out before being returned so weakly-relevant content never
    reaches the LLM prompt.
    """
    if not query_vector:
        return []

    semantic = await _semantic_search(query_vector, user_id, top_k, document_scope)

    w_sem = settings.hybrid_semantic_weight
    w_bm25 = settings.hybrid_bm25_weight

    # Map chunk_id → normalized semantic score.
    sem_norm: dict[str, float] = {
        r["chunk_id"]: r.get("score", 0.0)
        for r in semantic
        if r["chunk_id"] is not None
    }

    bm25_norm: dict[str, float] = {}
    bm25_map: dict[str, dict] = {}
    if query:
        bm25_ranked, bm25_map = await _bm25_search(user_id, query, top_k, document_scope)
        if bm25_ranked:
            norms = _minmax_bm25([s for _, s in bm25_ranked])
            bm25_norm = {cid: n for (cid, _), n in zip(bm25_ranked, norms)}

    # Candidate set = union of semantic + BM25 top results.
    by_id: dict[str, dict] = {
        r["chunk_id"]: r for r in semantic if r["chunk_id"] is not None
    }
    for cid in bm25_norm:
        if cid not in by_id:
            bm_chunk = bm25_map.get(cid) or {}
            by_id[cid] = {
                "chunk_id": cid,
                "text": bm_chunk.get("text", ""),
                "page_number": bm_chunk.get("page_number"),
                "document_id": bm_chunk.get("document_id"),
                "score": 0.0,
            }

    merged: list[dict] = []
    for cid, base in by_id.items():
        s = sem_norm.get(cid, 0.0)
        b = bm25_norm.get(cid, 0.0)
        combined = w_sem * s + w_bm25 * b
        # Without BM25 signal report the raw semantic similarity so `score`
        # stays a clean 0..1 anchored at true cosine similarity.
        score = combined if bm25_norm else s
        merged.append(
            {
                "chunk_id": base.get("chunk_id"),
                "text": base.get("text", ""),
                "page_number": base.get("page_number"),
                "document_id": base.get("document_id"),
                "score": score,
                "semantic_score": s,
                "bm25_score": b,
            }
        )

    merged.sort(key=lambda r: r["score"], reverse=True)

    # Apply minimum relevance threshold — exclude weakly-relevant chunks so
    # they don't contaminate the LLM prompt and cause "random-seeming" answers.
    threshold = settings.relevance_threshold
    filtered = [r for r in merged if r["score"] >= threshold] if threshold > 0.0 else merged

    # If filtering removes everything, fall back to the single best chunk so
    # the LLM can still give an "I don't have enough info" answer grounded on
    # whatever was closest rather than a completely empty context.
    if not filtered and merged:
        filtered = merged[:1]

    out = filtered[:top_k]

    log.info(
        "retrieved_hybrid",
        count=len(out),
        top_score=round(out[0]["score"], 4) if out else None,
        threshold=threshold,
        total_candidates=len(merged),
        filtered_out=len(merged) - len(filtered),
        bm25_active=bool(bm25_norm),
    )
    return out


def relevant(chunks: list[dict], threshold: float | None = None) -> bool:
    """True if at least one chunk clears the relevance threshold.

    Uses ``settings.relevance_threshold`` by default (configurable via env var).
    Pass an explicit ``threshold`` to override for a specific call site.
    """
    t = threshold if threshold is not None else settings.relevance_threshold
    return any((c.get("score") or 0) >= t for c in chunks)
