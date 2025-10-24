"""Local embedding client (Sentence-Transformers, all-MiniLM-L6-v2)."""
import asyncio
import threading

_MODEL_NAME = "all-MiniLM-L6-v2"
_EMBED_DIM = 384

_lock = threading.Lock()
_model = None


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed_dimension() -> int:
    return _EMBED_DIM


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts locally (CPU). Returns a list of vectors."""
    if not texts:
        return []
    model = await asyncio.to_thread(_get_model)
    vectors = await asyncio.to_thread(model.encode, texts, normalize_embeddings=True)
    return [v.tolist() for v in vectors]


async def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    return (await embed_texts([text]))[0]
