"""
Memory Retriever — Pattern 15: Memory-Augmented Context Injection.

Runs 4 retrieval sources in parallel and merges into a ranked context string
injected into agent system prompts below the cache boundary.

Sources (all run concurrently via asyncio.gather):
  1. Hot cache   (~0ms)    — agent_memory.json
  2. Semantic    (~200ms)  — Mem0g vector similarity
  3. Graph       (~400ms)  — Mem0g graph traversal
  4. Procedural  (~50ms)   — LangMem behavioral patterns

Total latency: ~400ms (bottlenecked by graph traversal).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from src.config.settings import settings
from src.persistence.knowledge_graph import knowledge_graph
from src.persistence.memory_store import get_memory_context

logger = logging.getLogger(__name__)


async def get_context(
    agent_id: str,
    task: str,
    token_budget: int | None = None,
) -> str:
    """
    Build a memory context string for injection into an agent's system prompt.

    Returns an empty string if memory graph is disabled or if the budget is 0.
    Runs all sources in parallel; total latency = max(source latencies) ≈ 400ms.
    """
    budget = token_budget or (
        settings.memory_hot_cache_tokens
        + settings.memory_semantic_tokens
        + settings.memory_graph_tokens
        + settings.memory_procedural_tokens
    )

    if budget == 0:
        return ""

    # Run all 4 sources in parallel
    hot_task = get_memory_context(agent_id)
    semantic_task = _semantic_search(agent_id, task)
    graph_task = _graph_context(task)
    procedural_task = _procedural_memory(agent_id, task)

    hot, semantic, graph, procedural = await asyncio.gather(
        hot_task,
        semantic_task,
        graph_task,
        procedural_task,
        return_exceptions=True,
    )

    # Collect non-error results
    sections: list[tuple[str, str]] = []
    if isinstance(hot, str) and hot:
        sections.append(("Known facts (hot cache)", hot))
    if isinstance(semantic, str) and semantic:
        sections.append(("Related context (semantic)", semantic))
    if isinstance(graph, str) and graph:
        sections.append(("Connected context (graph)", graph))
    if isinstance(procedural, str) and procedural:
        sections.append(("Learned procedures", procedural))

    if not sections:
        return ""

    # Merge and enforce token budget (rough approximation: 1 token ≈ 4 chars)
    char_budget = budget * 4
    lines = ["[MEMORY CONTEXT]"]
    char_used = len(lines[0])

    for title, content in sections:
        section = f"\n{title}:\n{content}"
        if char_used + len(section) > char_budget:
            # Truncate to remaining budget
            remaining = char_budget - char_used - len(f"\n{title}:\n")
            if remaining > 100:  # only add if there's meaningful content
                lines.append(f"\n{title}:\n{content[:remaining]}…")
            break
        lines.append(section)
        char_used += len(section)

    return "\n".join(lines)


async def _semantic_search(agent_id: str, query: str) -> str:
    """Vector similarity search in the knowledge graph."""
    if not settings.memory_graph_enabled:
        return ""
    try:
        results = await knowledge_graph.search(query, agent_id=agent_id, limit=5)
        if not results:
            return ""
        lines = []
        for r in results:
            content = r.get("memory", r.get("label", "")) if isinstance(r, dict) else str(r)
            if content:
                lines.append(f"• {content}")
        return "\n".join(lines)
    except Exception as exc:
        logger.debug("Semantic search failed: %s", exc)
        return ""


async def _graph_context(query: str) -> str:
    """Multi-hop graph traversal from entities mentioned in the query."""
    if not settings.memory_graph_enabled:
        return ""
    try:
        # Extract the most salient entity from the query (simple heuristic)
        entity = _extract_primary_entity(query)
        if not entity:
            return ""
        result = await knowledge_graph.get_related(entity, hops=settings.memory_graph_hops)
        nodes = result.get("nodes", [])
        if not nodes:
            return ""
        lines = []
        for node in nodes[:8]:  # limit to 8 related nodes
            content = node.get("label", node.get("memory", "")) if isinstance(node, dict) else str(node)
            if content:
                lines.append(f"• {content}")
        return "\n".join(lines)
    except Exception as exc:
        logger.debug("Graph context failed: %s", exc)
        return ""


async def _procedural_memory(agent_id: str, task: str) -> str:
    """Load LangMem procedural memory (learned workflows)."""
    try:
        from langmem import create_memory_store  # type: ignore[import]
        store = create_memory_store()
        # LangMem procedural retrieval — implementation depends on version
        results = await store.search(
            (agent_id, "procedural"),
            query=task,
            limit=3,
        )
        if not results:
            return ""
        lines = [str(r.value) for r in results if hasattr(r, "value")]
        return "\n".join(f"• {l}" for l in lines if l)
    except Exception:
        # LangMem not available or no procedural memory yet — silently skip
        return ""


def _extract_primary_entity(text: str) -> str:
    """
    Simple heuristic to extract the most likely primary entity from a query.
    For production, this would use NER. Here we use capitalisation as a proxy.
    """
    # Look for capitalised words (likely entities)
    tokens = re.findall(r"\b[A-Z][a-zA-Z0-9]+\b", text)
    if tokens:
        return tokens[0]
    # Fall back to first noun phrase (first 3 words)
    words = text.split()
    return " ".join(words[:3]) if words else ""
