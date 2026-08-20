"""Evaluation dataset loader.

Two modes:
1. **Dynamic (default)** — ``build_dynamic_dataset`` is called at eval time and
   generates questions from the user's *actual* uploaded documents by sampling
   representative chunks from Chroma. This works for any document, at any time,
   with no manual curation needed.

2. **Static fixture (legacy/debug)** — ``load_eval_dataset`` reads the
   hand-written JSON from ``fixtures/eval_dataset.json``.  This is kept for
   development reference and for CI tests that seed the fixture documents.

The dynamic path is the production default; the fixture path is kept but no
longer used by the live ``/eval/run`` endpoint.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.constants import ProcessingStatus
from app.core.logger import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger("eval.dataset")

_FIXTURE = Path(__file__).parent / "fixtures" / "eval_dataset.json"

# How many chunks to sample per document as eval questions.
N_QUESTIONS_PER_DOC = 3


# ---------------------------------------------------------------------------
# Static fixture loader (legacy / debug only)
# ---------------------------------------------------------------------------

def load_eval_dataset() -> list[dict]:
    """Return the hand-written eval dataset from the JSON fixture.

    Used only for development reference; the live endpoint uses
    :func:`build_dynamic_dataset` instead.
    """
    import json

    try:
        with _FIXTURE.open(encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        log.warning("eval_dataset_missing", path=str(_FIXTURE))
        return []
    except json.JSONDecodeError as e:
        log.error("eval_dataset_invalid", error=str(e))
        return []
    return data


def dataset_size() -> int:
    return len(load_eval_dataset())


# ---------------------------------------------------------------------------
# Dynamic dataset builder
# ---------------------------------------------------------------------------

async def build_dynamic_dataset(
    user_id: str,
    session: "AsyncSession",
) -> list[dict]:
    """Build an eval dataset on-the-fly from the user's uploaded documents.

    For each document that has ``processing_status == COMPLETED`` the function
    samples up to :data:`N_QUESTIONS_PER_DOC` chunks from Chroma.  Each sampled
    chunk becomes one eval item:

    * ``question`` — the chunk text (the retrieval pipeline should rank the
      source document highly when asked to retrieve context for this exact text).
    * ``expected_documents`` — a single-element list containing the source
      ``document_id`` (UUID string), used as the ground-truth label.
    * ``source_document_name`` — the human-readable ``original_filename`` for UI
      display in the eval dashboard.

    Returns an empty list when the user has no completed documents or when
    Chroma holds no chunks for the collection.
    """
    from sqlalchemy import select

    from app.ai.vectorstore import chroma_client
    from app.models.document import Document

    # 1. Fetch all completed documents for this user.
    res = await session.execute(
        select(Document.id, Document.original_filename).where(
            Document.user_id == user_id,  # type: ignore[arg-type]
            Document.processing_status == ProcessingStatus.COMPLETED,
        )
    )
    docs = res.all()  # list of (id, original_filename) rows

    if not docs:
        log.info("eval_dynamic_no_docs", user_id=user_id)
        return []

    # 2. Pull all chunks from Chroma for this user (one round-trip).
    all_chunks = await chroma_client.get_all_chunks(user_id)
    if not all_chunks:
        log.info("eval_dynamic_no_chunks", user_id=user_id)
        return []

    # Build a mapping: document_id -> list of chunks
    doc_id_to_name: dict[str, str] = {str(doc_id): fname for doc_id, fname in docs}
    chunks_by_doc: dict[str, list[dict]] = {}
    for chunk in all_chunks:
        did = str(chunk.get("document_id") or "")
        if did and did in doc_id_to_name:
            chunks_by_doc.setdefault(did, []).append(chunk)

    # 3. Sample N_QUESTIONS_PER_DOC evenly-spread chunks per document.
    dataset: list[dict] = []
    for doc_id, chunk_list in chunks_by_doc.items():
        n = min(N_QUESTIONS_PER_DOC, len(chunk_list))
        if n == 0:
            continue

        # Evenly spread indices across the full chunk list for coverage.
        if len(chunk_list) <= n:
            sampled = chunk_list
        else:
            step = len(chunk_list) / n
            sampled = [chunk_list[int(i * step)] for i in range(n)]

        for idx, chunk in enumerate(sampled):
            text = (chunk.get("text") or "").strip()
            if not text:
                continue
            dataset.append(
                {
                    "id": f"dyn-{doc_id[:8]}-{idx}",
                    "question": text,
                    "expected_answer": text,          # same passage is the ground truth
                    "expected_documents": [doc_id],   # document_id UUID as ground truth
                    "source_document_name": doc_id_to_name.get(doc_id, ""),
                }
            )

    # Shuffle so that documents are interleaved in the results table.
    random.shuffle(dataset)
    log.info(
        "eval_dynamic_built",
        user_id=user_id,
        n_docs=len(chunks_by_doc),
        n_questions=len(dataset),
    )
    return dataset
