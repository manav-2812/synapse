"""RAG subpackage — retrieval + prompt construction."""
from app.ai.rag.prompt_builder import build_prompt
from app.ai.rag.retriever import relevant, retrieve

__all__ = ["retrieve", "relevant", "build_prompt"]
