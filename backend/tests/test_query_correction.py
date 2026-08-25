"""Unit tests for project-specific query correction service."""
import time
import pytest
from app.services.query_correction import correct_query, load_known_terms, QueryCorrectionResult


def test_known_terms_loading():
    terms = load_known_terms()
    assert "GrabBite" in terms
    assert "Synapse" in terms
    assert "ChromaDB" in terms


def test_correct_grab_byte_to_grabbite():
    res = correct_query("What is grab byte architecture?")
    assert res.was_corrected is True
    assert res.corrected_query == "What is GrabBite architecture?"
    assert len(res.corrections) == 1
    assert res.corrections[0].original == "grab byte"
    assert res.corrections[0].corrected == "GrabBite"


def test_correct_grab_bite_case():
    res = correct_query("explain grab bite ordering flow")
    assert res.was_corrected is True
    assert res.corrected_query == "explain GrabBite ordering flow"
    assert res.corrections[0].original == "grab bite"
    assert res.corrections[0].corrected == "GrabBite"


def test_correct_syn_apse_to_synapse():
    res = correct_query("How does syn apse study assistant work?")
    assert res.was_corrected is True
    assert res.corrected_query == "How does Synapse study assistant work?"
    assert res.corrections[0].original == "syn apse"
    assert res.corrections[0].corrected == "Synapse"


def test_correct_fast_api_to_fastapi():
    res = correct_query("Is fast api used for the backend?")
    assert res.was_corrected is True
    assert res.corrected_query == "Is FastAPI used for the backend?"
    assert res.corrections[0].original == "fast api"
    assert res.corrections[0].corrected == "FastAPI"


def test_correct_single_word_typo():
    res = correct_query("tell me about chromadb and grabbite")
    # 'chromadb' and 'grabbite' in lowercase should normalize to canonical 'ChromaDB' and 'GrabBite'
    assert res.was_corrected is True
    assert "ChromaDB" in res.corrected_query
    assert "GrabBite" in res.corrected_query


def test_already_correct_term_not_modified():
    res = correct_query("Tell me about GrabBite features and Synapse RAG.")
    assert res.was_corrected is False
    assert res.corrected_query == "Tell me about GrabBite features and Synapse RAG."
    assert len(res.corrections) == 0


def test_unrelated_words_not_modified():
    queries = [
        "What is a binary search tree?",
        "Explain machine learning regression",
        "Who is the professor for this course?",
        "How do I calculate gradient descent?",
    ]
    for q in queries:
        res = correct_query(q)
        assert res.was_corrected is False
        assert res.corrected_query == q
        assert len(res.corrections) == 0


def test_punctuation_preserved():
    res = correct_query("Can you summarize (grab byte) for Chapter 02?")
    assert res.was_corrected is True
    assert res.corrected_query == "Can you summarize (GrabBite) for Chapter 02?"


def test_empty_or_whitespace_query():
    assert correct_query("").was_corrected is False
    assert correct_query("   ").was_corrected is False


def test_custom_term_list():
    custom_terms = ["QuantumLeap", "RoboTutor"]
    res = correct_query("Tell me about quantum leap", known_terms=custom_terms)
    assert res.was_corrected is True
    assert res.corrected_query == "Tell me about QuantumLeap"
    assert res.corrections[0].corrected == "QuantumLeap"


def test_performance_latency():
    query = "What is grab byte and how does it integrate with fast api and syn apse?"
    # Warmup
    correct_query(query)
    start = time.perf_counter()
    iterations = 50
    for _ in range(iterations):
        correct_query(query)
    elapsed = (time.perf_counter() - start) / iterations
    # Must execute in under 5ms per query
    assert elapsed < 0.005, f"Execution took {elapsed*1000:.2f}ms"
