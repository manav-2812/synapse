"""Pydantic schemas for the retrieval evaluation endpoints."""
from pydantic import BaseModel


class EvalRunItem(BaseModel):
    """Per-question evaluation result."""
    id: str
    question: str
    expected_answer: str
    expected_documents: list[str] = []
    retrieved_documents: list[str] = []
    precision_at_k: float
    recall_at_k: float
    mrr: float
    hit: bool
    skipped: bool = False


class EvalAggregate(BaseModel):
    precision_at_k: float
    recall_at_k: float
    mrr: float
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
