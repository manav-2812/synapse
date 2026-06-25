"""In-memory LRU cache for finalized LLM answers.

Keyed on hash(user_id + normalized_query + document_scope). A simple
lightweight in-memory LRU cache — no Redis needed. Bounded by max size (oldest
evicted) and optional TTL.
"""
import hashlib
import time
import threading
from collections import OrderedDict

from app.core.config import settings

_lock = threading.Lock()
_store: "OrderedDict[str, tuple[float, str]]" = OrderedDict()


def make_key(user_id: str, query: str, scope: list[str] | None) -> str:
    normalized = " ".join(query.lower().split())
    scope_part = ",".join(sorted(scope or []))
    raw = f"{user_id}|{normalized}|{scope_part}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get(key: str) -> str | None:
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        ts, value = entry
        if settings.response_cache_ttl_seconds > 0 and (
            time.time() - ts > settings.response_cache_ttl_seconds
        ):
            _store.pop(key, None)
            return None
        # Mark as most-recently-used.
        _store.move_to_end(key)
        return value


def set(key: str, value: str) -> None:
    with _lock:
        _store[key] = (time.time(), value)
        _store.move_to_end(key)
        while len(_store) > settings.response_cache_max_size:
            _store.popitem(last=False)


def size() -> int:
    with _lock:
        return len(_store)


# Module-level counters so the usage endpoint can report a cache-hit rate
# without a DB round-trip for health checks (real analytics come from the
# persisted llm_usage_logs table).
_hits = 0
_misses = 0


def record_access(hit: bool) -> None:
    global _hits, _misses
    with _lock:
        if hit:
            _hits += 1
        else:
            _misses += 1


def hit_rate() -> float:
    with _lock:
        total = _hits + _misses
        return (_hits / total) if total else 0.0
