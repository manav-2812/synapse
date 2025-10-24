"""Retrieval evaluation endpoints.

``POST /api/v1/eval/run`` runs the hand-written eval set through the *real*
retrieval pipeline (hybrid BM25 + semantic) for the authenticated user, scores
each question with precision@k / recall@k / MRR, and persists an aggregate run
to the ``eval_runs`` table. ``GET /api/v1/eval/runs`` returns historical runs
so the dashboard can plot quality trends.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings.embedding_client import embed_query
from app.ai.rag import retrieve
from app.api.deps import get_current_user, get_db
from app.core.logger import get_logger
from app.eval.eval_dataset import load_eval_dataset
from app.eval.metrics import aggregate, mrr, precision_at_k, recall_at_k
from app.models.document import Document
from app.models.eval_run import EvalRun
from app.models.user import User
from app.schemas.eval_schema import EvalRunItem, EvalRunResponse, RunEvalResponse

log = get_logger("eval.routes")

router = APIRouter(prefix="/api/v1/eval", tags=["eval"])

K = 5  # retrieved results counted for @k metrics


@router.post("/run", response_model=RunEvalResponse, status_code=status.HTTP_200_OK)
async def run_eval(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    """Run the full eval set against the user's retrieval pipeline."""
    dataset = load_eval_dataset()
    if not dataset:
        return RunEvalResponse(
            user_id=str(current_user.id),
            timestamp=datetime.now(timezone.utc).isoformat(),
            k=K,
            results=[],
            aggregate={"precision_at_k": 0.0, "recall_at_k": 0.0, "mrr": 0.0,
                       "n_evaluated": 0, "n_total": 0, "n_passed": 0},
        )

    # Resolve expected document filenames -> this user's real document ids.
    expected_names = {n for item in dataset for n in item.get("expected_documents", [])}
    name_to_ids: dict[str, list[str]] = {}
    if expected_names:
        res = await session.execute(
            select(Document.id, Document.original_filename).where(
                Document.user_id == current_user.id,
                Document.original_filename.in_(expected_names),
            )
        )
        for doc_id, fname in res.all():
            name_to_ids.setdefault(fname, []).append(str(doc_id))

    results: list[EvalRunItem] = []
    for item in dataset:
        expected_ids = {
            did
            for name in item.get("expected_documents", [])
            for did in name_to_ids.get(name, [])
        }

        query_vector = await embed_query(item["question"])
        chunks = await retrieve(
            query_vector,
            str(current_user.id),
            top_k=K,
            query=item["question"],
        )
        retrieved_ids = [str(c["document_id"]) for c in chunks if c.get("document_id")]

        if not expected_ids:
            # User hasn't uploaded the source doc(s) for this question.
            results.append(
                EvalRunItem(
                    id=item["id"],
                    question=item["question"],
                    expected_answer=item.get("expected_answer", ""),
                    expected_documents=item.get("expected_documents", []),
                    retrieved_documents=retrieved_ids,
                    precision_at_k=0.0,
                    recall_at_k=0.0,
                    mrr=0.0,
                    hit=False,
                    skipped=True,
                )
            )
            continue

        p = precision_at_k(retrieved_ids, expected_ids, K)
        r = recall_at_k(retrieved_ids, expected_ids, K)
        m = mrr(retrieved_ids, expected_ids)
        results.append(
            EvalRunItem(
                id=item["id"],
                question=item["question"],
                expected_answer=item.get("expected_answer", ""),
                expected_documents=item.get("expected_documents", []),
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

    return RunEvalResponse(
        user_id=str(current_user.id),
        timestamp=run.raw_results["timestamp"],
        k=K,
        results=results,
        aggregate=agg,
    )


@router.get("/runs", response_model=list[EvalRunResponse])
async def list_runs(current_user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
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
