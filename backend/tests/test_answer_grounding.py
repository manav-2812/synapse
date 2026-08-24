"""Phase 4 — Answer Accuracy & Grounding verification.

Tests that:
1. Retrieved chunks are injected into the system prompt as [Source N] blocks.
2. The prompt structure forces LLM to answer from sources (grounding instructions present).
3. The relevance threshold actually filters out low-scoring chunks before they
   reach the prompt — the primary fix for "random-seeming" answers.
4. Citation markers in the system prompt match the chunks that were retrieved.
5. The `relevant()` helper correctly uses the configurable threshold from settings.
6. A query with no matching content produces an honest "not covered" framing,
   not silent hallucination (prompt instruction verification).

These are all unit-level tests (no real LLM calls, no DB) and run deterministically.
"""
import asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_chunk(chunk_id: str, text: str, score: float, page: int = 1) -> dict:
    return {
        "chunk_id": chunk_id,
        "text": text,
        "page_number": page,
        "document_id": "doc-test",
        "score": score,
        "semantic_score": score,
        "bm25_score": 0.0,
    }


# ---------------------------------------------------------------------------
# 1. Prompt structure — grounding instructions
# ---------------------------------------------------------------------------

def test_prompt_contains_grounding_instruction():
    """System prompt must tell the LLM to use ONLY provided excerpts."""
    from app.ai.rag.prompt_builder import build_prompt

    chunks = [_make_chunk("c1", "Photosynthesis produces glucose.", 0.8)]
    system, user = build_prompt("What does photosynthesis produce?", chunks)

    assert "ONLY" in system or "only" in system, "Grounding 'only' instruction missing from system prompt"
    assert "NOTE EXCERPTS" in system, "'NOTE EXCERPTS' section header missing"
    assert "outside knowledge" in system.lower() or "never use" in system.lower() or \
           "never" in system.lower(), "Anti-hallucination instruction missing"


def test_prompt_honest_no_coverage_instruction():
    """System prompt must instruct LLM to say 'not covered' when excerpts are empty."""
    from app.ai.rag.prompt_builder import build_prompt

    system, user = build_prompt("What is quantum entanglement?", chunks=[])
    assert "not covered" in system.lower() or "not contain" in system.lower(), \
        "No instruction to honestly admit when topic is not in the notes"


# ---------------------------------------------------------------------------
# 2. Citation injection — [Source N] markers
# ---------------------------------------------------------------------------

def test_source_markers_match_chunk_count():
    """Each retrieved chunk must produce a [Source N] block in the system prompt."""
    from app.ai.rag.prompt_builder import build_prompt

    chunks = [
        _make_chunk("c1", "Mitochondria produce ATP.", 0.9, page=2),
        _make_chunk("c2", "Einstein published in 1905.", 0.7, page=5),
        _make_chunk("c3", "Water boils at 100°C.", 0.6, page=8),
    ]
    system, user = build_prompt("Explain ATP production.", chunks)

    assert "[Source 1]" in system
    assert "[Source 2]" in system
    assert "[Source 3]" in system
    # Source 4 must NOT appear (only 3 chunks).
    assert "[Source 4]" not in system


def test_source_includes_page_number():
    """Page numbers must appear in the formatted source block."""
    from app.ai.rag.prompt_builder import build_prompt

    chunks = [_make_chunk("c1", "Some text here.", 0.8, page=12)]
    system, _ = build_prompt("Question?", chunks)
    assert "page 12" in system


def test_source_text_is_verbatim_in_prompt():
    """The exact chunk text must appear in the system prompt, not paraphrased."""
    from app.ai.rag.prompt_builder import build_prompt

    verbatim = "The Krebs cycle generates NADH and FADH2 in the mitochondrial matrix."
    chunks = [_make_chunk("c1", verbatim, 0.85)]
    system, _ = build_prompt("Describe the Krebs cycle.", chunks)
    assert verbatim in system


# ---------------------------------------------------------------------------
# 3. Threshold filtering — low-score chunks excluded from the LLM
# ---------------------------------------------------------------------------

def test_threshold_filters_low_score_chunks(monkeypatch):
    """Chunks below settings.relevance_threshold are excluded from retrieval output."""
    import app.ai.rag.retriever as ret_mod

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        return [
            {"chunk_id": "good", "text": "Relevant content.",  "page_number": 1,
             "document_id": "d1", "distance": 0.1},   # score ≈ 0.95 → kept
            {"chunk_id": "bad",  "text": "Unrelated noise.", "page_number": 2,
             "document_id": "d2", "distance": 1.9},   # score ≈ 0.05 → filtered
        ]

    monkeypatch.setattr(ret_mod.chroma_client, "query_chunks", fake_query)
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.15)

    out = asyncio.run(ret_mod.retrieve([0.1] * 384, "user-x", top_k=5))
    ids = [c["chunk_id"] for c in out]
    assert "good" in ids, "High-score chunk should be kept"
    assert "bad" not in ids, "Low-score chunk should be filtered out by threshold"


def test_threshold_zero_passes_all_chunks(monkeypatch):
    """Setting threshold=0.0 disables filtering (legacy fallback behaviour)."""
    import app.ai.rag.retriever as ret_mod

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        return [
            {"chunk_id": "a", "text": "Text A.", "page_number": 1,
             "document_id": "d1", "distance": 0.05},
            {"chunk_id": "b", "text": "Text B.", "page_number": 2,
             "document_id": "d2", "distance": 1.95},  # score ≈ 0.025
        ]

    monkeypatch.setattr(ret_mod.chroma_client, "query_chunks", fake_query)
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.0)

    out = asyncio.run(ret_mod.retrieve([0.1] * 384, "user-x", top_k=5))
    ids = [c["chunk_id"] for c in out]
    assert "a" in ids
    assert "b" in ids, "Threshold=0 should pass all chunks regardless of score"


def test_fallback_returns_single_best_when_all_filtered(monkeypatch):
    """When ALL chunks are below threshold, return the single best rather than empty."""
    import app.ai.rag.retriever as ret_mod

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        # All chunks have low similarity (distance > 1.7 → score < 0.15).
        return [
            {"chunk_id": "x", "text": "Marginally relevant.", "page_number": 1,
             "document_id": "d1", "distance": 1.75},
            {"chunk_id": "y", "text": "Even less relevant.", "page_number": 2,
             "document_id": "d2", "distance": 1.85},
        ]

    monkeypatch.setattr(ret_mod.chroma_client, "query_chunks", fake_query)
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.15)

    out = asyncio.run(ret_mod.retrieve([0.1] * 384, "user-x", top_k=5))
    assert len(out) == 1, "Should fall back to exactly 1 best chunk, not empty list"
    assert out[0]["chunk_id"] == "x", "Should be the highest-scoring chunk"


# ---------------------------------------------------------------------------
# 4. `relevant()` helper uses configurable threshold
# ---------------------------------------------------------------------------

def test_relevant_uses_settings_threshold(monkeypatch):
    """relevant() should use settings.relevance_threshold, not a hardcoded 0.3."""
    from app.ai.rag.retriever import relevant
    import app.ai.rag.retriever as ret_mod

    chunks = [_make_chunk("c1", "Some text.", score=0.20)]

    # With threshold=0.15 (default): score 0.20 clears it → True.
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.15)
    assert relevant(chunks) is True

    # Raise threshold to 0.25: score 0.20 no longer clears → False.
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.25)
    assert relevant(chunks) is False


def test_relevant_explicit_threshold_overrides_settings(monkeypatch):
    """An explicit threshold passed to relevant() overrides settings."""
    from app.ai.rag.retriever import relevant
    import app.ai.rag.retriever as ret_mod

    chunks = [_make_chunk("c1", "Text.", score=0.50)]

    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.0)
    # Explicit threshold of 0.9 should cause False even though settings is 0.0.
    assert relevant(chunks, threshold=0.9) is False
    assert relevant(chunks, threshold=0.3) is True


# ---------------------------------------------------------------------------
# 5. Scores are within expected range
# ---------------------------------------------------------------------------

def test_scores_are_bounded_0_to_1(monkeypatch):
    """All retrieved chunk scores must be in [0, 1]."""
    import app.ai.rag.retriever as ret_mod

    async def fake_query(user_id, qvec, top_k=5, document_scope=None):
        return [
            {"chunk_id": str(i), "text": f"Text {i}", "page_number": i,
             "document_id": "d1", "distance": float(i) * 0.3}
            for i in range(7)
        ]

    async def fake_all(user_id):
        return [
            {"chunk_id": str(i), "text": f"Text {i}",
             "page_number": i, "document_id": "d1"}
            for i in range(7)
        ]

    monkeypatch.setattr(ret_mod.chroma_client, "query_chunks", fake_query)
    monkeypatch.setattr(ret_mod.chroma_client, "get_all_chunks", fake_all)
    monkeypatch.setattr(ret_mod.settings, "relevance_threshold", 0.0)

    out = asyncio.run(ret_mod.retrieve(
        [0.1] * 384, "user-x", top_k=10, query="some keyword query"
    ))
    for c in out:
        assert 0.0 <= c["score"] <= 1.0, f"Score out of bounds: {c['score']}"
        assert 0.0 <= c["semantic_score"] <= 1.0
        assert 0.0 <= c["bm25_score"] <= 1.0


# ---------------------------------------------------------------------------
# 6. History window uses settings
# ---------------------------------------------------------------------------

def test_history_window_uses_settings(monkeypatch):
    """build_prompt() must respect settings.chat_history_window, not a hardcoded 3."""
    from app.ai.rag.prompt_builder import build_prompt
    import app.core.config as cfg_mod

    class FakeSettings:
        chat_history_window = 2

    monkeypatch.setattr(cfg_mod, "settings", FakeSettings())

    class FakeMessage:
        def __init__(self, role, content):
            from app.core.constants import MessageRole
            self.role = role
            self.content = content

    from app.core.constants import MessageRole

    history = [
        FakeMessage(MessageRole.USER, f"Q{i}") for i in range(10)
    ]
    system, user = build_prompt("Final question?", chunks=[], history=history)
    # With window=2, only Q8 and Q9 should appear (last 2).
    assert "Q9" in user or "Q9" in system
    assert "Q0" not in user, "Old history messages beyond window should be excluded"
