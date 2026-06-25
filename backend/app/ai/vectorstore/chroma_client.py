"""ChromaDB persistence client — one collection per user."""
import asyncio
import os
import threading

# Chroma bundles a PostHog telemetry client that raises on a signature mismatch
# in some versions and spams non-fatal errors into the logs. Opt out at import
# time, before chromadb is first imported (it's imported lazily below).
os.environ.setdefault("CHROMA_TELEMETRY_OPTOUT", "true")

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("chroma")

_client = None
_lock = threading.Lock()


def _get_client():
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                import chromadb
                from chromadb.config import Settings as ChromaSettings

                _client = chromadb.PersistentClient(
                    path=settings.chroma_persist_path,
                    settings=ChromaSettings(anonymized_telemetry=False),
                )
    return _client


def collection_name(user_id: str) -> str:
    return f"user_{user_id}"


def _get_collection(user_id: str):
    return _get_client().get_or_create_collection(
        name=collection_name(user_id),
        metadata={"user_id": str(user_id)},
    )


async def add_chunks(
    user_id: str,
    chunk_ids: list[str],
    texts: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict],
) -> None:
    """Persist chunk embeddings in the user's Chroma collection."""
    col = await asyncio.to_thread(_get_collection, str(user_id))
    await asyncio.to_thread(
        col.add, ids=chunk_ids, documents=texts, embeddings=embeddings, metadatas=metadatas
    )


async def query_chunks(
    user_id: str,
    query_vector: list[float],
    top_k: int = 5,
    document_scope: list[str] | None = None,
) -> list[dict]:
    """Retrieve top_k similar chunks, optionally filtered to document_scope."""
    col = await asyncio.to_thread(_get_collection, str(user_id))
    where = None
    if document_scope:
        where = {"document_id": {"$in": [str(d) for d in document_scope]}}
    res = await asyncio.to_thread(
        col.query,
        query_embeddings=[query_vector],
        n_results=top_k,
        where=where,
        include=["documents", "metadatas", "distances"],
    )
    out: list[dict] = []
    ids = res.get("ids", [[]])[0]
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    for i, cid in enumerate(ids):
        out.append(
            {
                "chunk_id": cid,
                "text": docs[i] if docs else "",
                "page_number": (metas[i] or {}).get("page_number"),
                "document_id": (metas[i] or {}).get("document_id"),
                "distance": dists[i] if dists else None,
            }
        )
    return out


async def delete_collection(user_id: str) -> None:
    """Remove a user's entire collection (e.g., on account deletion)."""
    try:
        await asyncio.to_thread(_get_client().delete_collection, collection_name(str(user_id)))
    except Exception as e:  # collection may not exist
        # A missing collection is the normal case for users who never uploaded
        # (e.g. account deletion / test cleanup) — log it at info, not warning.
        if "does not exist" in str(e):
            log.info("delete_collection_missing", user_id=str(user_id))
        else:
            log.warning("delete_collection_failed", user_id=str(user_id), error=str(e))


async def delete_chunks(user_id: str, chunk_ids: list[str]) -> None:
    """Delete specific chunk vectors from the user's collection."""
    if not chunk_ids:
        return
    col = await asyncio.to_thread(_get_collection, str(user_id))
    await asyncio.to_thread(col.delete, ids=chunk_ids)


async def get_all_chunks(user_id: str) -> list[dict]:
    """Return every chunk in the user's collection (used to build the BM25 index)."""
    col = await asyncio.to_thread(_get_collection, str(user_id))
    res = await asyncio.to_thread(col.get, include=["documents", "metadatas"])
    ids = res.get("ids", [])
    docs = res.get("documents", [])
    metas = res.get("metadatas", [])

    def _doc(i: int) -> str:
        try:
            return docs[i] or ""
        except (IndexError, TypeError):
            return ""

    def _meta(i: int) -> dict:
        try:
            return metas[i] or {}
        except (IndexError, TypeError):
            return {}

    return [
        {
            "chunk_id": cid,
            "text": _doc(i),
            "page_number": _meta(i).get("page_number"),
            "document_id": _meta(i).get("document_id"),
        }
        for i, cid in enumerate(ids)
    ]
