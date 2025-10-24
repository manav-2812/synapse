"""Retrieval evaluation metrics.

All metrics operate on *sets of document ids* so they are independent of how
chunks are scored. ``k`` is the number of retrieved results we count.
"""
from collections.abc import Sequence


def precision_at_k(retrieved_ids: Sequence[str], expected_ids: set[str], k: int) -> float:
    """Fraction of the top-k retrieved docs that are relevant.

    retrieved_ids are in rank order; only the first ``k`` are considered.
    """
    if k <= 0 or not retrieved_ids:
        return 0.0
    top = list(retrieved_ids)[:k]
    if not top:
        return 0.0
    hits = sum(1 for doc_id in top if doc_id in expected_ids)
    return hits / len(top)


def recall_at_k(retrieved_ids: Sequence[str], expected_ids: set[str], k: int) -> float:
    """Fraction of relevant docs present in the top-k retrieved results."""
    if not expected_ids:
        return 0.0
    top = set(list(retrieved_ids)[:k])
    hits = len(top & expected_ids)
    return hits / len(expected_ids)


def mrr(retrieved_ids: Sequence[str], expected_ids: set[str]) -> float:
    """Mean Reciprocal Rank contribution: 1 / rank of first relevant doc.

    Returns 0.0 when no expected doc appears in the retrieved list.
    """
    if not expected_ids:
        return 0.0
    for rank, doc_id in enumerate(retrieved_ids, start=1):
        if doc_id in expected_ids:
            return 1.0 / rank
    return 0.0


def aggregate(results: list[dict]) -> dict:
    """Average precision / recall / MRR across evaluated (non-skipped) items."""
    scored = [r for r in results if not r.get("skipped")]
    if not scored:
        return {
            "precision_at_k": 0.0,
            "recall_at_k": 0.0,
            "mrr": 0.0,
            "n_evaluated": 0,
            "n_total": len(results),
            "n_passed": 0,
        }
    n = len(scored)
    avg_p = sum(r["precision_at_k"] for r in scored) / n
    avg_r = sum(r["recall_at_k"] for r in scored) / n
    avg_m = sum(r["mrr"] for r in scored) / n
    n_passed = sum(1 for r in scored if r.get("hit"))
    return {
        "precision_at_k": avg_p,
        "recall_at_k": avg_r,
        "mrr": avg_m,
        "n_evaluated": n,
        "n_total": len(results),
        "n_passed": n_passed,
    }
