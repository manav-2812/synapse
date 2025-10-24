"""Retrieval correctness + RAG grounding (LLM/embeddings/Chroma mocked)."""
import asyncio


def test_retrieve_normalizes_scores(monkeypatch):
    from app.ai.rag import retrieve

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        return [
            {"chunk_id": "a", "text": "alpha", "page_number": 1,
             "document_id": "doc1", "distance": 0.0},
            {"chunk_id": "b", "text": "beta", "page_number": 2,
             "document_id": "doc2", "distance": 1.5},
        ]

    monkeypatch.setattr(
        "app.ai.rag.retriever.chroma_client.query_chunks", fake_query
    )
    out = asyncio.run(retrieve([0.1] * 384, "user-x", top_k=5))
    assert len(out) == 2
    # Closest distance first.
    assert out[0]["document_id"] == "doc1"
    assert out[0]["score"] == 1.0  # distance 0 -> similarity 1.0
    assert out[1]["score"] == 0.25  # distance 1.5 -> 1 - 1.5/2 = 0.25


def test_build_prompt_includes_sources():
    from app.ai.rag.prompt_builder import build_prompt

    chunks = [
        {"text": "Mitochondria make ATP.", "page_number": 3, "document_id": "d1"},
    ]
    system, user = build_prompt("What makes ATP?", chunks)
    assert "[Source 1]" in system
    assert "Mitochondria make ATP." in system
    assert "page 3" in system
    assert "What makes ATP?" in user


def test_chat_grounding_pipeline(monkeypatch):
    """The exact retrieval -> prompt path RAG chat uses to ground answers."""
    from app.ai.rag import build_prompt, retrieve

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        return [
            {
                "chunk_id": "c1",
                "text": "The mitochondria is the powerhouse of the cell.",
                "page_number": 1,
                "document_id": "doc-xyz",
                "distance": 0.1,
            }
        ]

    monkeypatch.setattr(
        "app.ai.rag.retriever.chroma_client.query_chunks", fake_query
    )
    chunks = asyncio.run(retrieve([0.1] * 384, "user-x", top_k=5))
    assert chunks and "powerhouse" in chunks[0]["text"]
    # The grounded chunk becomes [Source 1] inside the system prompt the LLM sees.
    system, _ = build_prompt("What is the powerhouse of the cell?", chunks)
    assert "[Source 1]" in system
    assert "powerhouse" in system


def test_hybrid_outranks_pure_semantic_for_keyword_query(monkeypatch):
    """A keyword-heavy query should let BM25 promote the literally-matching chunk.

    Semantic search ranks chunk 'a' first (smaller vector distance), but the
    query is keyword-dense ("Einstein 1905 photoelectric") so BM25 ranks 'b'
    first. The blended hybrid result must differ from pure semantic and put 'b'
    ahead of 'a'.
    """
    from app.ai.rag import retrieve

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        # 'a' is closer in vector space; 'b' only shares keywords.
        return [
            {"chunk_id": "a", "text": "The mitochondria is the powerhouse of the cell.",
             "page_number": 1, "document_id": "doc-a", "distance": 0.2},
            {"chunk_id": "b", "text": "Einstein published the photoelectric effect paper in 1905.",
             "page_number": 2, "document_id": "doc-b", "distance": 0.8},
        ]

    async def fake_get_all(user_id):
        # A few noise docs so BM25's IDF is meaningful (N=2 collapses IDF to 0).
        return [
            {"chunk_id": "a", "text": "The mitochondria is the powerhouse of the cell.",
             "page_number": 1, "document_id": "doc-a"},
            {"chunk_id": "b", "text": "Einstein published the photoelectric effect paper in 1905.",
             "page_number": 2, "document_id": "doc-b"},
            {"chunk_id": "c", "text": "The cat sat on the mat.",
             "page_number": 3, "document_id": "doc-c"},
            {"chunk_id": "d", "text": "Water boils at 100 degrees Celsius.",
             "page_number": 4, "document_id": "doc-d"},
        ]

    monkeypatch.setattr("app.ai.rag.retriever.chroma_client.query_chunks", fake_query)
    monkeypatch.setattr("app.ai.rag.retriever.chroma_client.get_all_chunks", fake_get_all)

    # Pure semantic (no query text -> BM25 skipped).
    semantic_only = asyncio.run(retrieve([0.1] * 384, "user-x", top_k=5))
    assert [c["chunk_id"] for c in semantic_only] == ["a", "b"]

    # Hybrid with the keyword query.
    hybrid = asyncio.run(
        retrieve([0.1] * 384, "user-x", top_k=5, query="Einstein 1905 photoelectric")
    )
    assert [c["chunk_id"] for c in hybrid] != ["a", "b"]
    # BM25 should have pushed 'b' to the top.
    assert hybrid[0]["chunk_id"] == "b"
    assert hybrid[0]["bm25_score"] > hybrid[1]["bm25_score"]

