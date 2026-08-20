"""Pydantic schemas for the retrieval evaluation endpoints."""
from pydantic import BaseModel


class EvalRunItem(BaseModel):
    """Per-question evaluation result."""
    id: str
    question: str
    expected_answer: str
    expected_documents: list[str] = []
    source_document_name: str = ""   # human-readable filename for UI display
    retrieved_documents: list[str] = []
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float = 0.0
    hit: bool
    skipped: bool = False


class EvalAggregate(BaseModel):
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float = 0.0
    n_evaluated: int
    n_total: int
    n_passed: int


class RunEvalResponse(BaseModel):
    user_id: str
    timestamp: str
    k: int
    results: list[EvalRunItem]
    aggregate: EvalAggregate


class EvalRunResponse(BaseModel):
    id: str
    timestamp: str
    aggregate_scores: dict
    raw_results: dict
