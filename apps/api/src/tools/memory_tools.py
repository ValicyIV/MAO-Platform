"""
memory_tools.py — Knowledge graph tools for agents (Pattern 14).

These tools give agents mid-task read/write access to the shared
knowledge graph. All agents receive remember_fact and recall by default.
Only the supervisor gets get_agent_memory (cross-agent access).
"""

from __future__ import annotations

import structlog
from langchain_core.tools import tool

log = structlog.get_logger(__name__)


@tool
async def remember_fact_tool(
    entity: str,
    fact: str,
    confidence: float = 0.9,
    relationship: str = "knows_about",
) -> str:
    """
    Store a fact in the shared knowledge graph.
    Use this to preserve important information across sessions.

    Args:
        entity:       The entity this fact is about (e.g. 'API rate limit').
        fact:         The fact to remember (e.g. 'Rate limit is 100 req/min').
        confidence:   Confidence score 0.0-1.0 (default 0.9).
        relationship: Edge type to use (default 'knows_about').

    Returns:
        Confirmation that the fact was stored.
    """
    from src.persistence.knowledge_graph import knowledge_graph
    from src.config.settings import settings

    if not settings.memory_graph_enabled:
        return "Memory graph disabled — fact not stored."

    try:
        await knowledge_graph.add_memories(
            agent_id="agent",   # will be overridden by the calling node context
            content=f"{entity}: {fact}",
        )
        return f"Remembered: {entity} → {fact}"
    except Exception as e:
        log.warning("remember_fact.failed", entity=entity, error=str(e))
        return f"Could not store fact: {e!s}"


@tool
async def recall_tool(query: str, limit: int = 5) -> str:
    """
    Search the shared knowledge graph for relevant facts.
    Uses hybrid vector + graph traversal retrieval.

    Args:
        query: What to search for.
        limit: Max number of results (1-20).

    Returns:
        Formatted list of relevant facts with confidence scores.
    """
    from src.persistence.knowledge_graph import knowledge_graph
    from src.config.settings import settings

    if not settings.memory_graph_enabled:
        return "Memory graph disabled."

    try:
        results = await knowledge_graph.search(
            query=query, limit=min(limit, 20)
        )
        if not results:
            return "No relevant memories found."

        lines = []
        for r in results:
            score = round(r.get("score", 0.0), 2)
            label = r.get("label", "")
            summary = r.get("summary") or r.get("content", "")
            lines.append(f"[{score}] {label}: {summary}")

        return "\n".join(lines)
    except Exception as e:
        log.warning("recall.failed", query=query[:80], error=str(e))
        return f"Recall failed: {e!s}"


@tool
async def link_concepts_tool(
    concept_a: str,
    concept_b: str,
    relationship: str,
    notes: str = "",
) -> str:
    """
    Create an explicit relationship between two concepts in the knowledge graph.
    Use to record important connections discovered during research or analysis.

    Args:
        concept_a:    First concept or entity.
        concept_b:    Second concept or entity.
        relationship: Relationship type (e.g. 'depends_on', 'contradicts', 'derived_from').
        notes:        Optional notes about this relationship.

    Returns:
        Confirmation of the created link.
    """
    from src.persistence.knowledge_graph import knowledge_graph
    from src.config.settings import settings

    if not settings.memory_graph_enabled:
        return "Memory graph disabled."

    try:
        content = f"{concept_a} {relationship} {concept_b}"
        if notes:
            content += f". Notes: {notes}"
        await knowledge_graph.add_memories(agent_id=None, content=content)
        return f"Linked: {concept_a} --[{relationship}]--> {concept_b}"
    except Exception as e:
        return f"Could not create link: {e!s}"


@tool
async def get_agent_memory_tool(agent_id: str) -> str:
    """
    Retrieve everything the knowledge graph knows about a specific agent.
    For supervisor use only — enables cross-agent context awareness.

    Args:
        agent_id: The agent whose memory to retrieve.

    Returns:
        Formatted summary of the agent's knowledge graph entries.
    """
    from src.persistence.knowledge_graph import knowledge_graph
    from src.config.settings import settings

    if not settings.memory_graph_enabled:
        return "Memory graph disabled."

    try:
        results = await knowledge_graph.search(query="*", agent_id=agent_id, limit=20)
        if not results:
            return f"No memory found for agent: {agent_id}"
        lines = [f"Memory for {agent_id}:"]
        for r in results:
            lines.append(f"  - {r.get('label', '')}: {r.get('summary', '')}")
        return "\n".join(lines)
    except Exception as e:
        return f"Failed to retrieve agent memory: {e!s}"
