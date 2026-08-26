"""Retrieval evaluation endpoints.

``POST /api/v1/eval/run`` dynamically builds an evaluation dataset from *every*
document the authenticated user has successfully uploaded (``processing_status ==
completed``).  For each document, a sample of representative chunks is drawn from
Chroma and used as questions; the source ``document_id`` is the ground-truth
label.  This means the eval automatically covers all past and future uploads with
no manual curation or fixture files.

Each question is run through the real hybrid retrieval pipeline (BM25 + semantic),
scored with precision@k / recall@k / MRR / NDCG, and the aggregate run is
persisted to ``eval_runs`` so the dashboard can plot quality trends over time.

``GET /api/v1/eval/runs`` returns historical runs (newest first).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_query
from app.ai.rag import retrieve
from app.api.deps import get_current_user, get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.eval.eval_dataset import build_dynamic_dataset
from app.eval.metrics import aggregate, mrr, ndcg_at_k, precision_at_k, recall_at_k
from app.models.eval_run import EvalRun
from app.models.user import User
from app.schemas.eval_schema import EvalRunItem, EvalRunResponse, RunEvalResponse

log = get_logger("eval.routes")

router = APIRouter(prefix="/api/v1/eval", tags=["eval"])

K = 5  # retrieved results counted for @k metrics


@router.post("/run", response_model=RunEvalResponse, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def run_eval(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Run the retrieval eval against *all* of the user's uploaded documents.

    The dataset is generated dynamically — no fixture files involved.  Every
    completed document contributes questions proportional to its chunk count,
    so new uploads are automatically included in the next eval run.
    """
    user_id = str(current_user.id)

    # Build the dynamic dataset from this user's actual documents.
    dataset = await build_dynamic_dataset(user_id, session)

    if not dataset:
        log.info("eval_run_no_data", user_id=user_id)
        return RunEvalResponse(
            user_id=user_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            k=K,
            results=[],
            aggregate={
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "mrr": 0.0,
                "ndcg_at_k": 0.0,
                "n_evaluated": 0,
                "n_total": 0,
                "n_passed": 0,
            },
        )

    results: list[EvalRunItem] = []

    for item in dataset:
        # Ground-truth: set of document_id UUIDs expected for this question.
        expected_ids: set[str] = set(item.get("expected_documents", []))

        # Embed the question text and retrieve top-k chunks.
        query_vector = await embed_query(item["question"])
        chunks = await retrieve(
            query_vector,
            user_id,
            top_k=K,
            query=item["question"],
        )
        retrieved_ids = [str(c["document_id"]) for c in chunks if c.get("document_id")]

        p = precision_at_k(retrieved_ids, expected_ids, K)
        r = recall_at_k(retrieved_ids, expected_ids, K)
        m = mrr(retrieved_ids, expected_ids)
        nd = ndcg_at_k(retrieved_ids, expected_ids, K)

        results.append(
            EvalRunItem(
                id=item["id"],
                question=item["question"],
                expected_answer=item.get("expected_answer", ""),
                expected_documents=list(expected_ids),
                source_document_name=item.get("source_document_name", ""),
                retrieved_documents=retrieved_ids,
                precision_at_k=p,
                recall_at_k=r,
                mrr=m,
                hit=m > 0,
                skipped=False,
            )
        )

    agg = aggregate([r.model_dump() for r in results])

    run = EvalRun(
        user_id=current_user.id,
        aggregate_scores=agg,
        raw_results={
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "k": K,
            "results": [r.model_dump() for r in results],
        },
    )
    session.add(run)
    await session.commit()

    log.info(
        "eval_run_complete",
        user_id=user_id,
        n_total=agg["n_total"],
        n_evaluated=agg["n_evaluated"],
        precision=agg["precision_at_k"],
        recall=agg["recall_at_k"],
        mrr=agg["mrr"],
    )

    return RunEvalResponse(
        user_id=user_id,
        timestamp=run.raw_results["timestamp"],
        k=K,
        results=results,
        aggregate=agg,
    )


@router.get("/runs", response_model=list[EvalRunResponse])
async def list_runs(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Return historical eval runs (newest first) for the dashboard chart."""
    res = await session.execute(
        select(EvalRun)
        .where(EvalRun.user_id == current_user.id)
        .order_by(EvalRun.timestamp.desc())
        .limit(50)
    )
    runs = res.scalars().all()
    return [
        EvalRunResponse(
            id=str(run.id),
            timestamp=run.timestamp.isoformat() if run.timestamp else "",
            aggregate_scores=run.aggregate_scores,
            raw_results=run.raw_results,
        )
        for run in runs
    ]
