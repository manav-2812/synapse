"""Hybrid retrieval: semantic vector search blended with BM25 keyword search.

For every query we run dense (Chroma) and sparse (BM25) retrieval, normalize
both to 0..1, then combine with tunable weights from settings:

    score = w_semantic * semantic_norm + w_bm25 * bm25_norm

The merged candidate set is re-ranked and the top-k returned. This catches
keyword-heavy queries ("Einstein 1905 photoelectric") that pure semantic
search can mis-rank. When ``query`` (raw text) is not supplied the BM25 branch
is skipped and the function degrades to pure semantic search.
"""
from app.ai.rag import bm25 as bm25_mod
from app.ai.vectorstore import chroma_client
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("rag.retriever")

_CANDIDATE_FACTOR = 3  # pull more candidates than top_k so blending has range


def _normalize(distance: float | None) -> float | None:
    """Chroma returns L2 distance; convert to a 0..1 similarity for display."""
    if distance is None:
        return None
    return max(0.0, 1.0 - float(distance) / 2.0)


def _minmax(values: list[float]) -> list[float]:
    """Normalize a list of raw scores to 0..1 via min-max (flat list -> 0s)."""
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [0.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


async def _semantic_search(
    query_vector: list[float],
    user_id: str,
    top_k: int,
    document_scope: list[str] | None,
) -> list[dict]:
    raw = await chroma_client.query_chunks(
        user_id, query_vector, top_k=top_k * _CANDIDATE_FACTOR, document_scope=document_scope
    )
    raw.sort(key=lambda r: r["distance"] if r["distance"] is not None else float("inf"))
    out: list[dict] = []
    for r in raw:
        out.append(
            {
                "chunk_id": r["chunk_id"],
                "text": r["text"],
                "page_number": r["page_number"],
                "document_id": r["document_id"],
                "distance": r["distance"],
                "score": _normalize(r["distance"]),
            }
        )
    return out


async def _bm25_search(
    user_id: str, query: str, top_k: int, document_scope: list[str] | None
) -> list[tuple[str, float]]:
    """Build (or reuse) the per-user BM25 index and score the query."""
    chunks = await chroma_client.get_all_chunks(user_id)
    if not chunks:
        return []
    index = bm25_mod.build_index(
        [c["chunk_id"] for c in chunks], [c["text"] for c in chunks]
    )
    ranked = index.search(query, top_k=top_k * _CANDIDATE_FACTOR)
    if document_scope:
        scope = {str(d) for d in document_scope}
        id_to_doc = {c["chunk_id"]: c["document_id"] for c in chunks}
        ranked = [(cid, s) for cid, s in ranked if str(id_to_doc.get(cid)) in scope]
    return ranked


async def retrieve(
    query_vector: list[float],
    user_id: str,
    top_k: int = 5,
    document_scope: list[str] | None = None,
    query: str | None = None,
) -> list[dict]:
    """Return the top_k chunks blended from semantic + BM25 signals.

    Pass ``query`` (the raw query text) to enable the BM25 branch; omit it for
    pure semantic retrieval.
    """
    if not query_vector:
        return []

    semantic = await _semantic_search(query_vector, user_id, top_k, document_scope)

    w_sem = settings.hybrid_semantic_weight
    w_bm25 = settings.hybrid_bm25_weight

    sem_norm: dict[str, float] = {}
    for r in semantic:
        if r["chunk_id"] is not None:
            sem_norm[r["chunk_id"]] = r.get("score") or 0.0

    bm25_norm: dict[str, float] = {}
    if query:
        bm25_ranked = await _bm25_search(user_id, query, top_k, document_scope)
        if bm25_ranked:
            norms = _minmax([s for _, s in bm25_ranked])
            for (cid, _), n in zip(bm25_ranked, norms):
                bm25_norm[cid] = n

    # Candidate set = union of semantic + bm25 top results.
    by_id = {r["chunk_id"]: r for r in semantic if r["chunk_id"] is not None}
    candidates: dict[str, dict] = {cid: r for cid, r in by_id.items()}
    for cid in bm25_norm:
        if cid not in candidates:
            candidates[cid] = by_id.get(cid) or {
                "chunk_id": cid,
                "text": "",
                "page_number": None,
                "document_id": None,
            }

    merged: list[dict] = []
    for cid, base in candidates.items():
        s = sem_norm.get(cid, 0.0)
        b = bm25_norm.get(cid, 0.0)
        combined = w_sem * s + w_bm25 * b
        # With no BM25 signal (query text absent) report the raw normalized
        # semantic similarity so `score` stays a clean 0..1 (reaches 1.0).
        # With BM25 present, report the blended score used for ranking.
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
    out = merged[:top_k]
    log.info("retrieved_hybrid", count=len(out), top_score=out[0]["score"] if out else None)
    return out


def relevant(chunks: list[dict], threshold: float = 0.3) -> bool:
    """True if at least one chunk clears the relevance threshold."""
    return any((c.get("score") or 0) >= threshold for c in chunks)
