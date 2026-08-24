"""RAG subpackage — retrieval + prompt construction."""
from app.ai.rag.prompt_builder import build_prompt, build_web_prompt, should_use_long_response
from app.ai.rag.retriever import relevant, retrieve

__all__ = ["retrieve", "relevant", "build_prompt", "build_web_prompt", "should_use_long_response"]
