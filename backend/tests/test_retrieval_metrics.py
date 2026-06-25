"""Offline retrieval evaluation for the hybrid retriever.

This is a *logic/regression* eval of :func:`app.ai.rag.retriever.retrieve`,
not an embedding-quality eval. We mock the dense index so each query returns a
fixed set of semantic distances (the ``distances`` field in the gold set), while
BM25 is computed for real from the corpus text. That lets us measure whether the
fusion + top-k selection actually surfaces the gold chunks, deterministically.

Gold set: ``tests/data/retrieval_eval.jsonl`` — one JSON object per line:
    {"query": str, "expected_chunk_ids": [str],
     "document_scope": [str]?, "distances": {chunk_id: float}?}

Metrics reported at k=5: Hit Rate, MRR, NDCG. The sweep varies
``hybrid_semantic_weight`` / ``hybrid_bm25_weight`` to find the best blend.
"""
import asyncio
import json
import math
from pathlib import Path

import app.ai.rag.retriever as retriever_mod
from app.ai.rag import retrieve

K = 5
FAKE_VECTOR = [0.1] * 384
EVAL_USER = "eval-user"

# Backing corpus. ``get_all_chunks`` returns this for BM25; the gold set's
# per-query ``distances`` supply the (mocked) semantic signal on top of it.
CORPUS = [
    {"chunk_id": "a", "document_id": "doc-bio",  "page_number": 1, "text": "The mitochondria is the powerhouse of the cell, producing ATP through cellular respiration."},
    {"chunk_id": "b", "document_id": "doc-phys", "page_number": 2, "text": "Einstein published the photoelectric effect paper in 1905, earning the 1921 Nobel Prize."},
    {"chunk_id": "c", "document_id": "doc-phys", "page_number": 3, "text": "Planck introduced the quantum hypothesis in 1900, quantizing energy into discrete packets."},
    {"chunk_id": "d", "document_id": "doc-chem", "page_number": 4, "text": "Water boils at 100 degrees Celsius at standard atmospheric pressure."},
    {"chunk_id": "e", "document_id": "doc-chem", "page_number": 5, "text": "The pH scale measures acidity; pure water has a neutral pH of 7 at 25 degrees Celsius."},
    {"chunk_id": "f", "document_id": "doc-bio",  "page_number": 6, "text": "Photosynthesis in plant chloroplasts converts sunlight, water, and CO2 into glucose and oxygen."},
    {"chunk_id": "g", "document_id": "doc-bio",  "page_number": 7, "text": "ATP synthase is the enzyme that generates ATP, the universal energy currency of the cell."},
    {"chunk_id": "h", "document_id": "doc-phys", "page_number": 8, "text": "Newton's second law states force equals mass times acceleration, F = ma."},
    {"chunk_id": "i", "document_id": "doc-hist", "page_number": 9, "text": "The French Revolution began in 1789 and abolished the monarchy."},
    {"chunk_id": "j", "document_id": "doc-hist", "page_number": 10, "text": "World War II started in 1939 and ended in 1945."},
    {"chunk_id": "k", "document_id": "doc-chem", "page_number": 11, "text": "A covalent bond forms when two atoms share a pair of electrons."},
    {"chunk_id": "l", "document_id": "doc-math", "page_number": 12, "text": "The Pythagorean theorem states that a squared plus b squared equals c squared for right triangles."},
]

GOLD_PATH = Path(__file__).parent / "data" / "retrieval_eval.jsonl"


# --------------------------------------------------------------------------- #
# Metrics (pure functions, binary relevance)
# --------------------------------------------------------------------------- #
def hit_rate_at_k(retrieved, relevant, k):
    if not relevant:
        return 0.0
    return 1.0 if any(c in relevant for c in retrieved[:k]) else 0.0


def mrr_at_k(retrieved, relevant, k):
    for i, cid in enumerate(retrieved[:k], start=1):
        if cid in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at_k(retrieved, relevant, k):
    rel = [1.0 if c in relevant else 0.0 for c in retrieved[:k]]
    dcg = sum(r / math.log2(i + 2) for i, r in enumerate(rel))  # rank i+1 -> log2(i+2)
    n_rel = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(n_rel))
    return dcg / idcg if idcg > 0 else 0.0


def aggregate(cases, k=K):
    n = len(cases) or 1
    return {
        "hit_rate": sum(hit_rate_at_k(r, rel, k) for r, rel, _ in cases) / n,
        "mrr": sum(mrr_at_k(r, rel, k) for r, rel, _ in cases) / n,
        "ndcg": sum(ndcg_at_k(r, rel, k) for r, rel, _ in cases) / n,
    }


# --------------------------------------------------------------------------- #
# Harness
# --------------------------------------------------------------------------- #
def _load_gold():
    with open(GOLD_PATH) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def _make_query_chunks(distances):
    async def fake(user_id, qvec, top_k=5, document_scope=None):
        scope = {str(d) for d in document_scope} if document_scope else None
        out = []
        for c in CORPUS:
            if scope and str(c["document_id"]) not in scope:
                continue
            out.append({**c, "distance": float(distances.get(c["chunk_id"], 2.0))})
        out.sort(key=lambda r: r["distance"])
        return out[: max(1, top_k)]
    return fake


async def _get_all_chunks(user_id):
    return list(CORPUS)


def _run_gold(monkeypatch, w_sem, w_bm25, use_bm25=True):
    """Run every gold query under the given weights; return (cases, rows)."""
    monkeypatch.setattr(retriever_mod.settings, "hybrid_semantic_weight", w_sem)
    monkeypatch.setattr(retriever_mod.settings, "hybrid_bm25_weight", w_bm25)
    monkeypatch.setattr(retriever_mod.chroma_client, "get_all_chunks", _get_all_chunks)

    gold = _load_gold()
    cases = []
    for entry in gold:
        monkeypatch.setattr(
            retriever_mod.chroma_client,
            "query_chunks",
            _make_query_chunks(entry.get("distances", {})),
        )
        out = asyncio.run(
            retrieve(
                FAKE_VECTOR,
                EVAL_USER,
                top_k=K,
                document_scope=entry.get("document_scope"),
                query=entry["query"] if use_bm25 else None,
            )
        )
        retrieved = [c["chunk_id"] for c in out]
        cases.append((retrieved, set(entry["expected_chunk_ids"]), entry["query"]))
    return cases


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_retrieval_metrics_meet_baseline(monkeypatch):
    """Best hybrid config must clear quality floors (regression guard)."""
    gold = _load_gold()
    best = None
    for w_bm25 in (0.0, 0.2, 0.4, 0.5, 0.6, 0.8):
        w_sem = round(1.0 - w_bm25, 4)
        cases = _run_gold(monkeypatch, w_sem, w_bm25, use_bm25=True)
        agg = aggregate(cases)
        if best is None or agg["mrr"] > best[1]["mrr"]:
            best = ((w_sem, w_bm25), agg)
    (w_sem, w_bm25), agg = best
    print(f"\nBest hybrid config: semantic={w_sem} bm25={w_bm25}")
    print(f"  HitRate@{K}={agg['hit_rate']:.3f}  MRR@{K}={agg['mrr']:.3f}  NDCG@{K}={agg['ndcg']:.3f}")

    assert agg["hit_rate"] >= 0.875, f"HitRate too low: {agg['hit_rate']}"
    assert agg["mrr"] >= 0.75, f"MRR too low: {agg['mrr']}"


def test_hybrid_beats_pure_semantic_on_eval(monkeypatch):
    """Hybrid should match or beat pure-semantic on this gold set."""
    hybrid = aggregate(_run_gold(monkeypatch, 0.6, 0.4, use_bm25=True))
    semantic = aggregate(_run_gold(monkeypatch, 1.0, 0.0, use_bm25=False))
    print(f"\nPure semantic: HitRate={semantic['hit_rate']:.3f} MRR={semantic['mrr']:.3f} NDCG={semantic['ndcg']:.3f}")
    print(f"Hybrid 0.6/0.4: HitRate={hybrid['hit_rate']:.3f} MRR={hybrid['mrr']:.3f} NDCG={hybrid['ndcg']:.3f}")
    assert hybrid["mrr"] >= semantic["mrr"] - 1e-9
    assert hybrid["hit_rate"] >= semantic["hit_rate"] - 1e-9


def test_weight_sweep_reports_table(monkeypatch):
    """Sweep the blend weights and print a comparison table (no hard assert)."""
    rows = []
    for w_bm25 in (0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
        w_sem = round(1.0 - w_bm25, 4)
        cases = _run_gold(monkeypatch, w_sem, w_bm25, use_bm25=True)
        agg = aggregate(cases)
        rows.append((w_sem, w_bm25, agg))

    semantic = aggregate(_run_gold(monkeypatch, 1.0, 0.0, use_bm25=False))

    print("\nRetrieval eval — weight sweep (k=%d)" % K)
    print(f"{'sem':>5} {'bm25':>5} {'HitRate':>8} {'MRR':>6} {'NDCG':>6}")
    print("-" * 34)
    for w_sem, w_bm25, agg in rows:
        print(f"{w_sem:5.2f} {w_bm25:5.2f} {agg['hit_rate']:8.3f} {agg['mrr']:6.3f} {agg['ndcg']:6.3f}")
    print(f"{'sem':>5} {'off':>5} {semantic['hit_rate']:8.3f} {semantic['mrr']:6.3f} {semantic['ndcg']:6.3f}  (BM25 disabled)")
    best = max(rows, key=lambda r: (r[2]["mrr"], r[2]["hit_rate"]))
    print(f"-> best by MRR: semantic={best[0]:.2f} bm25={best[1]:.2f}")
