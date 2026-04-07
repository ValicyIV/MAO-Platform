"""
search.py — Web search, URL fetch, and arXiv search tools.

All tools are defined as LangChain @tool decorated functions
so they can be bound to any agent in the registry.
"""

from __future__ import annotations

import httpx
import structlog
from langchain_core.tools import tool

log = structlog.get_logger(__name__)


@tool
async def web_search_tool(query: str) -> str:
    """
    Search the web for current information.
    Use for recent events, facts, news, or anything that may have changed.

    Args:
        query: The search query string.

    Returns:
        Formatted search results with titles, snippets, and URLs.
    """
    try:
        # Uses Anthropic's built-in web search via the API
        # In production, replace with your preferred search provider
        # (Brave Search, Serper, Tavily, etc.)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 5},
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("web", {}).get("results", [])
                formatted = "\n\n".join(
                    f"**{r['title']}**\n{r.get('description', '')}\nURL: {r['url']}"
                    for r in results[:5]
                )
                return formatted or "No results found."
            return f"Search failed with status {resp.status_code}"
    except Exception as e:
        log.warning("web_search.failed", query=query[:80], error=str(e))
        return f"Search unavailable: {e!s}"


@tool
async def fetch_url(url: str) -> str:
    """
    Fetch the text content of a web page.

    Args:
        url: The URL to fetch.

    Returns:
        The page text content (truncated to 8000 chars).
    """
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "MAO-Agent/0.1"})
            resp.raise_for_status()
            # Basic text extraction — replace with trafilatura in production
            text = resp.text
            # Strip obvious HTML tags
            import re
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:8000]
    except Exception as e:
        return f"Failed to fetch {url}: {e!s}"


@tool
async def arxiv_tool(query: str, max_results: int = 5) -> str:
    """
    Search arXiv for academic papers.

    Args:
        query: Search query for papers.
        max_results: Number of results to return (1-10).

    Returns:
        Formatted list of papers with titles, authors, abstracts, and arXiv IDs.
    """
    try:
        import urllib.parse
        encoded = urllib.parse.quote(query)
        url = (
            f"http://export.arxiv.org/api/query"
            f"?search_query=all:{encoded}&max_results={min(max_results, 10)}"
        )
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        # Parse Atom XML
        import xml.etree.ElementTree as ET
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(resp.text)
        entries = root.findall("atom:entry", ns)

        results = []
        for entry in entries[:max_results]:
            title_el = entry.find("atom:title", ns)
            summary_el = entry.find("atom:summary", ns)
            id_el = entry.find("atom:id", ns)
            authors = [
                a.findtext("atom:name", default="", namespaces=ns)
                for a in entry.findall("atom:author", ns)
            ]
            title = title_el.text.strip() if title_el is not None else "Unknown"
            abstract = summary_el.text.strip()[:400] if summary_el is not None else ""
            arxiv_id = (id_el.text or "").split("/abs/")[-1]
            results.append(
                f"**{title}**\n"
                f"Authors: {', '.join(authors[:3])}\n"
                f"arXiv: {arxiv_id}\n"
                f"Abstract: {abstract}..."
            )

        return "\n\n---\n\n".join(results) if results else "No papers found."
    except Exception as e:
        return f"arXiv search failed: {e!s}"
