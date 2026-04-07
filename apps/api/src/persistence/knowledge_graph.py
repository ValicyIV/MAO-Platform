"""
Knowledge Graph — Tier 3 of the three-layer memory system.

Wraps Mem0g with a Kuzu embedded graph database backend.
Single shared graph across ALL agents — entities, relationships, temporal facts.

Key behaviours:
  - Entity extraction + relation inference runs automatically on add_memories()
  - Conflict detection before write (flags contradictions)
  - Entity deduplication (resolves aliases to canonical nodes)
  - Hybrid retrieval: vector similarity + graph traversal
  - Full graph serialisation for the Memory Graph UI view

Usage:
    from src.persistence.knowledge_graph import knowledge_graph

    await knowledge_graph.add_memories("research_agent", "The API rate limit is 100/min")
    results = await knowledge_graph.search("rate limit", agent_id="research_agent")
    context = await knowledge_graph.get_related("API", hops=2)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from src.config.settings import settings

logger = logging.getLogger(__name__)


class KnowledgeGraph:
    """
    Obsidian-style shared knowledge graph.

    Backed by Mem0 (OSS) with Kuzu as the graph store backend.
    Kuzu is an embedded database — no separate server process required.
    """

    def __init__(self) -> None:
        self._client: Any = None
        self._initialized = False

    async def init(self) -> None:
        """Initialise the Mem0 client with Kuzu backend. Call at app startup."""
        if self._initialized:
            return

        if not settings.memory_graph_enabled:
            logger.info("Knowledge graph disabled via MEMORY_GRAPH_ENABLED=false")
            self._initialized = True
            return

        try:
            from mem0 import MemoryClient  # type: ignore[import]

            kuzu_path = Path(settings.kuzu_db_path)
            kuzu_path.mkdir(parents=True, exist_ok=True)

            config = {
                "graph_store": {
                    "provider": "kuzu",
                    "config": {"database_path": str(kuzu_path)},
                },
                "vector_store": {
                    "provider": "qdrant",
                    "config": {"collection_name": "mao_memories", "on_disk": True},
                },
                "llm": {
                    "provider": "anthropic",
                    "config": {
                        "model": "claude-haiku-4-5",  # cheapest for extraction
                        "api_key": settings.anthropic_api_key,
                    },
                },
                "embedder": {
                    "provider": "anthropic",
                    "config": {"model": "voyage-3"},
                },
            }

            if settings.mem0_api_key:
                # Use Mem0 cloud API
                self._client = MemoryClient(api_key=settings.mem0_api_key)
                logger.info("Knowledge graph: Mem0 cloud API")
            else:
                # Use OSS Mem0 with local Kuzu backend
                from mem0 import Memory  # type: ignore[import]
                self._client = Memory.from_config(config)
                logger.info("Knowledge graph: Mem0 OSS with Kuzu at %s", kuzu_path)

        except ImportError:
            logger.warning("mem0 not installed — knowledge graph disabled")
        except Exception as exc:
            logger.warning("Failed to initialise knowledge graph: %s", exc)

        self._initialized = True

    def _check_init(self) -> bool:
        """Return True if the client is available."""
        return self._initialized and self._client is not None

    async def add_memories(self, agent_id: str, content: str) -> dict[str, Any]:
        """
        Extract entities and relationships from content and write to the graph.

        Mem0 automatically:
          1. Extracts entities (nodes) from text
          2. Infers relationships (edges) between entities
          3. Detects conflicts with existing graph elements
          4. Deduplicates entities (alias resolution)
        """
        if not self._check_init():
            return {}
        try:
            result = self._client.add(
                content,
                user_id=agent_id,
                output_format="v1.1",
                metadata={"source": "episode_consolidation"},
            )
            added = len(result.get("results", []))
            logger.debug("KG: added %d memories for %s", added, agent_id)
            return result
        except Exception as exc:
            logger.error("KG add_memories failed for %s: %s", agent_id, exc)
            return {}

    async def search(
        self,
        query: str,
        agent_id: str | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Hybrid search: vector similarity + graph traversal.
        If agent_id is None, searches across all agents.
        """
        if not self._check_init():
            return []
        try:
            kwargs: dict[str, Any] = {"limit": limit}
            if agent_id:
                kwargs["user_id"] = agent_id
            results = self._client.search(query, **kwargs)
            return results.get("results", results) if isinstance(results, dict) else results
        except Exception as exc:
            logger.error("KG search failed: %s", exc)
            return []

    async def get_related(
        self,
        entity: str,
        hops: int | None = None,
    ) -> dict[str, Any]:
        """
        Multi-hop graph traversal from an entity node.
        Returns all nodes and edges within `hops` of the entity.
        """
        if not self._check_init():
            return {"nodes": [], "edges": []}
        max_hops = hops or settings.memory_graph_hops
        try:
            # Mem0g graph traversal — implementation varies by version
            if hasattr(self._client, "graph"):
                result = self._client.graph.traverse(entity, max_hops=max_hops)
                return result if isinstance(result, dict) else {"nodes": result, "edges": []}
            # Fallback: semantic search as approximation
            results = await self.search(entity, limit=20)
            return {"nodes": results, "edges": [], "fallback": True}
        except Exception as exc:
            logger.error("KG get_related failed for %r: %s", entity, exc)
            return {"nodes": [], "edges": []}

    async def get_full_graph(
        self,
        agent_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Serialise the full graph (or a single agent's subgraph) for the UI.
        Used by GET /api/memory/graph.
        """
        if not self._check_init():
            return {"entities": [], "relationships": [], "fetchedAt": 0}

        import time
        try:
            if hasattr(self._client, "graph") and hasattr(self._client.graph, "get_all"):
                raw = self._client.graph.get_all(user_id=agent_id)
            else:
                # Fallback: get_all memories and reconstruct graph shape
                kwargs: dict[str, Any] = {}
                if agent_id:
                    kwargs["user_id"] = agent_id
                raw = self._client.get_all(**kwargs)

            return {
                "entities": _normalise_nodes(raw),
                "relationships": _normalise_edges(raw),
                "fetchedAt": int(time.time() * 1000),
                "agentFilter": agent_id,
            }
        except Exception as exc:
            logger.error("KG get_full_graph failed: %s", exc)
            return {"entities": [], "relationships": [], "fetchedAt": 0}

    async def delete_entity(self, entity_id: str) -> bool:
        """Remove an entity from the knowledge graph."""
        if not self._check_init():
            return False
        try:
            self._client.delete(entity_id)
            return True
        except Exception as exc:
            logger.error("KG delete failed for %s: %s", entity_id, exc)
            return False

    async def close(self) -> None:
        """Clean up graph database connections."""
        if self._client and hasattr(self._client, "close"):
            try:
                self._client.close()
            except Exception:
                pass


# ── Normalisation helpers ─────────────────────────────────────────────────────

def _normalise_nodes(raw: Any) -> list[dict[str, Any]]:
    """Normalise Mem0 results into the MemoryNodeData shape the UI expects."""
    import time

    if isinstance(raw, dict):
        raw = raw.get("results", raw.get("nodes", []))
    if not isinstance(raw, list):
        return []

    nodes = []
    for item in raw:
        if isinstance(item, str):
            item = {"id": item, "memory": item}
        nodes.append({
            "entityId": item.get("id", ""),
            "entityType": item.get("entity_type", "fact"),
            "label": item.get("memory", item.get("label", "")),
            "summary": item.get("metadata", {}).get("summary"),
            "confidence": item.get("score", 1.0),
            "agentId": item.get("user_id"),
            "createdAt": int(item.get("created_at", time.time()) * 1000),
            "updatedAt": int(item.get("updated_at", time.time()) * 1000),
            "isContradicted": False,
        })
    return nodes


def _normalise_edges(raw: Any) -> list[dict[str, Any]]:
    """Normalise Mem0 graph edges into the MemoryEdgeData shape the UI expects."""
    import time

    if isinstance(raw, dict):
        raw = raw.get("edges", raw.get("relations", []))
    if not isinstance(raw, list):
        return []

    edges = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        edges.append({
            "id": item.get("id", f"{item.get('source')}-{item.get('target')}"),
            "source": item.get("source", item.get("source_id", "")),
            "target": item.get("target", item.get("target_id", "")),
            "data": {
                "relationship": item.get("relationship", item.get("relation", "knows_about")),
                "confidence": item.get("confidence", 1.0),
                "timestamp": int(item.get("created_at", time.time()) * 1000),
                "resolvedBy": None,
            },
        })
    return edges


# ── Singleton ─────────────────────────────────────────────────────────────────

knowledge_graph = KnowledgeGraph()
