"""
persistence/memory_retriever.py — Pattern 15: Memory-Augmented Context Injection.

Runs 3 retrieval sources in parallel and merges into a ranked context string
injected into agent system prompts below the cache boundary.

Sources (all run concurrently via asyncio.gather):
  1. Hot cache   (~0ms)    — agent_memory.json       (Pattern 7 tier 1)
  2. Semantic    (~15ms)   — fastembed + Kuzu cosine  (our KG, no API cost)
  3. Graph       (~20ms)   — Kuzu CypherQL traversal  (our KG, no API cost)

LangMem was here previously. Removed:
  - p95 latency of 59.82s makes it unusable for real-time injection
  - Replaced by our own KG which does the same job at ~20ms total

Total latency: ~20ms (all sources run in parallel, Kuzu is in-process).
Previously with Mem0g: ~400ms. 20x speedup from cutting the middleman.
"""

from __future__ import annotations

import asyncio
import re

import structlog

from src.config.settings import settings
from src.persistence.knowledge_graph import knowledge_graph
from src.persistence.memory_store import get_memory_context

log = structlog.get_logger(__name__)


async def get_context(
    agent_id: str,
    task: str,
    token_budget: int | None = None,
) -> str:
    """
    Build a memory context string for injection into an agent's system prompt.
    Returns an empty string if memory is disabled or budget is 0.
    """
    budget = token_budget or (
        settings.memory_hot_cache_tokens
        + settings.memory_semantic_tokens
        + settings.memory_graph_tokens
    )
    if budget == 0:
        return ""

    # Run all sources in parallel — Kuzu is embedded so latency is ~5-20ms each
    hot, semantic, graph = await asyncio.gather(
        get_memory_context(agent_id),
        _semantic_search(agent_id, task),
        _graph_context(task),
        return_exceptions=True,
    )

    sections: list[tuple[str, str]] = []
    if isinstance(hot,      str) and hot:      sections.append(("Known facts",          hot))
    if isinstance(semantic, str) and semantic: sections.append(("Related context",      semantic))
    if isinstance(graph,    str) and graph:    sections.append(("Connected context",    graph))

    if not sections:
        return ""

    # Merge and enforce token budget (1 token ≈ 4 chars)
    char_budget = budget * 4
    parts = ["[MEMORY CONTEXT]"]
    used  = len(parts[0])

    for title, content in sections:
        block = f"\n{title}:\n{content}"
        if used + len(block) > char_budget:
            remaining = char_budget - used - len(f"\n{title}:\n")
            if remaining > 100:
                parts.append(f"\n{title}:\n{content[:remaining]}…")
            break
        parts.append(block)
        used += len(block)

    return "\n".join(parts)


async def _semantic_search(agent_id: str, query: str) -> str:
    """Vector similarity search via fastembed + Kuzu (no API calls)."""
    if not settings.memory_graph_enabled:
        return ""
    try:
        results = await knowledge_graph.search(query, agent_id=agent_id, limit=5)
        if not results:
            return ""
        lines = []
        for r in results:
            label   = r.get("label", "")
            summary = r.get("summary", "")
            if label:
                lines.append(f"• {label}: {summary}" if summary else f"• {label}")
        return "\n".join(lines)
    except Exception as e:
        log.debug("semantic_search.failed", error=str(e)[:80])
        return ""


async def _graph_context(query: str) -> str:
    """Multi-hop graph traversal via Kuzu CypherQL (no API calls)."""
    if not settings.memory_graph_enabled:
        return ""
    try:
        entity = _primary_entity(query)
        if not entity:
            return ""
        result = await knowledge_graph.get_related(entity, hops=settings.memory_graph_hops)
        nodes  = result.get("nodes", [])
        if not nodes:
            return ""
        lines = []
        for node in nodes[:8]:
            label   = node.get("label", "")
            summary = node.get("summary", "")
            if label:
                lines.append(f"• {label}: {summary}" if summary else f"• {label}")
        return "\n".join(lines)
    except Exception as e:
        log.debug("graph_context.failed", error=str(e)[:80])
        return ""


def _primary_entity(text: str) -> str:
    """Extract the most likely primary entity from a query string."""
    # Capitalised words are likely proper nouns / named entities
    tokens = re.findall(r"\b[A-Z][a-zA-Z0-9_]+\b", text)
    if tokens:
        return tokens[0]
    words = text.split()
    return " ".join(words[:3]) if words else ""


# Convenience singleton used by agents/nodes.py
memory_retriever_module = type("_MemRetriever", (), {"get_context": staticmethod(get_context)})()
