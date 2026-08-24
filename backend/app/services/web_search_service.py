"""Web search service supporting Tavily API and direct zero-config web search fallback.

Used when the user requests Web mode or as a secondary retrieval source when document
(ChromaDB + BM25) retrieval returns no chunks that clear the relevance threshold.

Returns a list of WebSearchResult objects, each of which mirrors the shape
of a document SourceResponse so that the rest of the chat pipeline can treat
them uniformly: title, url, content, score.
"""
from __future__ import annotations

import asyncio
from html.parser import HTMLParser
import threading
import urllib.parse
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("web_search")


class WebSearchNotConfigured(Exception):
    """Raised when web search cannot be configured."""


class WebSearchUnavailable(Exception):
    """Raised when web search fails."""


@dataclass
class WebSearchResult:
    """A single result from Web Search, shaped like a document chunk."""

    title: str
    url: str
    content: str
    published_date: str | None = None
    score: float | None = None


# ── Lazy singleton Tavily client ───────────────────────────────────────────

_client = None
_client_lock = threading.Lock()


def _get_tavily_client():
    """Return a cached Tavily client if key is configured, else None."""
    global _client
    if not settings.tavily_api_key or "replace_with_your" in settings.tavily_api_key:
        return None

    if _client is None:
        with _client_lock:
            if _client is None:
                try:
                    from tavily import TavilyClient  # type: ignore[import-untyped]

                    _client = TavilyClient(api_key=settings.tavily_api_key)
                except Exception as exc:
                    log.warning("tavily_init_failed", error=str(exc))
                    return None
    return _client


class _DDGParser(HTMLParser):
    """Robust HTMLParser for DuckDuckGo Lite search results."""

    def __init__(self) -> None:
        super().__init__()
        self.results: list[dict[str, str]] = []
        self.current_link: str | None = None
        self.current_title: list[str] = []
        self.in_snippet: bool = False
        self.current_snippet: list[str] = []
        self.pending_item: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = dict(attrs)
        if tag == "a" and attr_dict.get("class") == "result-link":
            href = attr_dict.get("href") or ""
            actual_url = href
            if "uddg=" in href:
                try:
                    parsed = urllib.parse.urlparse(href)
                    qs = urllib.parse.parse_qs(parsed.query)
                    if "uddg" in qs and qs["uddg"]:
                        actual_url = qs["uddg"][0]
                except Exception:
                    actual_url = href
            self.current_link = actual_url
            self.current_title = []
        elif tag == "td" and attr_dict.get("class") == "result-snippet":
            self.in_snippet = True
            self.current_snippet = []

    def handle_data(self, data: str) -> None:
        if self.current_link is not None:
            self.current_title.append(data)
        elif self.in_snippet:
            self.current_snippet.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.current_link is not None:
            title = "".join(self.current_title).strip()
            self.pending_item = {"url": self.current_link, "title": title, "content": ""}
            self.current_link = None
            self.current_title = []
        elif tag == "td" and self.in_snippet:
            self.in_snippet = False
            snippet = "".join(self.current_snippet).strip()
            if self.pending_item:
                self.pending_item["content"] = snippet
                self.results.append(self.pending_item)
                self.pending_item = None
            self.current_snippet = []


async def _duckduckgo_search(query: str, max_results: int) -> list[WebSearchResult]:
    """Fallback search using DuckDuckGo Lite endpoint without requiring an API key."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    results: list[WebSearchResult] = []

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.post(
                "https://lite.duckduckgo.com/lite/",
                data={"q": query},
                headers=headers,
            )
            if resp.status_code == 200:
                parser = _DDGParser()
                parser.feed(resp.text)

                for i, item in enumerate(parser.results[:max_results]):
                    title = item.get("title", "").strip()
                    url = item.get("url", "").strip()
                    content = item.get("content", "").strip()

                    if title and (content or url):
                        results.append(
                            WebSearchResult(
                                title=title,
                                url=url,
                                content=content or title,
                                score=round(max(0.4, 0.95 - (i * 0.08)), 2),
                            )
                        )
    except Exception as exc:
        log.warning("ddg_search_error", error=str(exc)[:200], query_preview=query[:80])

    return results


async def search(query: str, max_results: int | None = None) -> list[WebSearchResult]:
    """Run web search via Tavily (if configured) or DuckDuckGo fallback."""
    k = max_results if max_results is not None else settings.web_search_max_results

    # 1. Try Tavily if configured
    tavily_client = _get_tavily_client()
    if tavily_client is not None:
        def _sync_tavily() -> list[WebSearchResult]:
            response = tavily_client.search(
                query=query,
                search_depth="basic",
                max_results=k,
                include_answer=False,
            )
            res: list[WebSearchResult] = []
            for item in response.get("results", []):
                res.append(
                    WebSearchResult(
                        title=str(item.get("title") or "Untitled"),
                        url=str(item.get("url") or ""),
                        content=str(item.get("content") or item.get("snippet") or ""),
                        published_date=item.get("published_date"),
                        score=float(item["score"]) if item.get("score") is not None else None,
                    )
                )
            return res

        try:
            results = await asyncio.to_thread(_sync_tavily)
            if results:
                log.info("tavily_search_ok", query_preview=query[:80], result_count=len(results))
                return results
        except Exception as exc:
            log.warning("tavily_search_failed_falling_back_to_ddg", error=str(exc)[:200])

    # 2. Direct web search fallback (zero API key needed)
    ddg_results = await _duckduckgo_search(query, k)
    if ddg_results:
        log.info("ddg_search_ok", query_preview=query[:80], result_count=len(ddg_results))
        return ddg_results

    log.warning("web_search_empty", query_preview=query[:80])
    return []
