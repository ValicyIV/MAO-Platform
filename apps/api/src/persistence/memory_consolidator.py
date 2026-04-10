"""
Memory Consolidator — Pattern 8: Background Memory Consolidation.

Runs during idle heartbeat cycles (Pattern 6). Three stages per agent:

  Stage 1 — Hot cache update (Haiku sub-agent)
    Reads recent episodes, rewrites agent_memory.json with deduped/pruned facts.

  Stage 2 — Knowledge graph extraction (our Kuzu + fastembed + Claude pipeline)
    Passes episode text through our custom KG: Claude entity extraction → fastembed
    embedding → conflict detection → write to Kuzu directly. No Mem0g.

  Stage 3 — Procedural patterns (stored in hot cache, not LangMem)
    Detects repeated tool-use patterns and saves them to agent_memory.json.
    LangMem removed: 59.82s p95 latency makes it unusable.

Usage:
    from src.persistence.memory_consolidator import consolidator
    await consolidator.consolidate("research_agent")
    await consolidator.consolidate_all()
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from src.config.settings import settings
from src.observability.telemetry import observe
from src.persistence.knowledge_graph import knowledge_graph
from src.persistence.memory_store import (
    append_episode,
    list_agent_ids,
    load_core_memory,
    load_recent_episodes,
    prune_old_episodes,
    save_core_memory,
)

logger = logging.getLogger(__name__)


class MemoryConsolidator:

    @observe("memory.consolidate")
    async def consolidate(self, agent_id: str) -> dict[str, Any]:
        """
        Run all three consolidation stages for a single agent.
        Returns a ConsolidationResult-shaped dict.
        """
        start = time.time()
        logger.info("Starting memory consolidation for %s", agent_id)

        episodes = await load_recent_episodes(agent_id)
        if not episodes:
            logger.debug("No episodes to consolidate for %s", agent_id)
            return {"agent_id": agent_id, "episodesProcessed": 0, "skipped": True}

        episodes_text = _format_episodes(episodes)
        kg_nodes_added = 0
        kg_edges_added = 0
        conflicts_detected = 0
        procedural_updated = 0
        hot_cache_updated = False

        # ── Stage 1: Hot cache update ─────────────────────────────────────────
        try:
            new_facts = await self._consolidate_hot_cache(agent_id, episodes_text)
            if new_facts:
                current = await load_core_memory(agent_id)
                current["facts"] = new_facts
                current["version"] = current.get("version", 0) + 1
                current["updated_at"] = int(time.time())
                await save_core_memory(agent_id, current)
                hot_cache_updated = True
                logger.info("Stage 1 complete: hot cache updated for %s", agent_id)
        except Exception as exc:
            logger.error("Stage 1 (hot cache) failed for %s: %s", agent_id, exc)

        # ── Stage 2: Knowledge graph extraction ──────────────────────────────
        if settings.memory_graph_enabled:
            try:
                result = await knowledge_graph.add_memories(agent_id, episodes_text)
                added = result.get("results", [])
                kg_nodes_added = len([r for r in added if r.get("event") == "ADD"])
                kg_edges_added = len([r for r in added if r.get("event") == "RELATION"])
                conflicts_detected = len([r for r in added if r.get("event") == "CONFLICT"])
                logger.info(
                    "Stage 2 complete: KG +%d nodes, +%d edges, %d conflicts for %s",
                    kg_nodes_added, kg_edges_added, conflicts_detected, agent_id,
                )

                # Log episode for the consolidation itself
                await append_episode(
                    agent_id,
                    "memory_write",
                    f"KG consolidation: {kg_nodes_added} nodes, {kg_edges_added} edges",
                    workflow_id="__consolidation__",
                )
            except Exception as exc:
                logger.error("Stage 2 (KG extraction) failed for %s: %s", agent_id, exc)

        # ── Stage 3: Procedural memory update ────────────────────────────────
        try:
            patterns = await self._update_procedural(agent_id, episodes)
            procedural_updated = len(patterns)
            if procedural_updated:
                logger.info(
                    "Stage 3 complete: %d procedural patterns updated for %s",
                    procedural_updated, agent_id,
                )
        except Exception as exc:
            logger.debug("Stage 3 (procedural) failed for %s: %s — skipping", agent_id, exc)

        # ── Prune old episodes ────────────────────────────────────────────────
        await prune_old_episodes(agent_id)

        duration_ms = int((time.time() - start) * 1000)
        logger.info(
            "Consolidation complete for %s in %dms",
            agent_id, duration_ms,
        )

        return {
            "agentId": agent_id,
            "ranAt": int(time.time() * 1000),
            "episodesProcessed": len(episodes),
            "hotCacheUpdated": hot_cache_updated,
            "kgNodesAdded": kg_nodes_added,
            "kgEdgesAdded": kg_edges_added,
            "conflictsDetected": conflicts_detected,
            "proceduralPatternsUpdated": procedural_updated,
            "durationMs": duration_ms,
        }

    async def consolidate_all(self) -> list[dict[str, Any]]:
        """Run consolidation for every known agent. Called by the heartbeat scheduler."""
        agent_ids = await list_agent_ids()
        results = []
        for agent_id in agent_ids:
            try:
                result = await self.consolidate(agent_id)
                results.append(result)
            except Exception as exc:
                logger.error("Consolidation failed for %s: %s", agent_id, exc)
                results.append({"agentId": agent_id, "error": str(exc)})
        return results

    # ── Stage implementations ─────────────────────────────────────────────────

    async def _consolidate_hot_cache(
        self, agent_id: str, episodes_text: str
    ) -> list[dict[str, Any]]:
        """Stage 1: Use the extraction model to distill facts from episodes."""
        from langchain_core.messages import HumanMessage, SystemMessage

        from src.agents.model_router import get_extraction_model
        from src.config.prompts import get_prompt

        llm = get_extraction_model()
        current = await load_core_memory(agent_id)
        current_facts = json.dumps(current.get("facts", []), indent=2)

        prompt = get_prompt(
            "consolidation",
            agent_role=agent_id,
            current_memory=current_facts,
            episodes=episodes_text[:6000],
            days=str(settings.memory_consolidation_batch_days),
        )

        resp = await llm.ainvoke([
            SystemMessage(content=prompt),
            HumanMessage(content="Consolidate the memory now."),
        ])
        content = resp.content if isinstance(resp.content, str) else str(resp.content)
        try:
            parsed = json.loads(content)
            return parsed.get("facts", [])
        except json.JSONDecodeError:
            logger.warning("Consolidation LLM returned non-JSON for %s", agent_id)
            return []

    async def _update_procedural(
        self,
        agent_id: str,
        episodes: list[dict],
    ) -> list[str]:
        """
        Stage 3: Detect repeated tool-use patterns.
        Stores patterns in the knowledge graph as Procedure entities.
        LangMem removed — p95 latency was 59.82s. Now uses our KG at ~15ms.
        """
        from src.persistence.knowledge_graph import knowledge_graph

        tool_calls: dict[str, int] = {}
        for ep in episodes:
            if ep.get("entry_type") == "tool_call":
                tool = ep.get("toolName", "")
                if tool:
                    tool_calls[tool] = tool_calls.get(tool, 0) + 1

        # Record tools used >= 3 times as learned procedures in the KG
        patterns: list[str] = []
        for tool, count in tool_calls.items():
            if count >= 3:
                procedure = f"{agent_id} consistently uses {tool} ({count} times in recent sessions)"
                await knowledge_graph.add_memories(
                    agent_id=agent_id,
                    content=procedure,
                )
                patterns.append(procedure)

        return patterns


# Singleton used by scheduler — import as `memory_consolidator` or `consolidator`.
memory_consolidator = MemoryConsolidator()
consolidator = memory_consolidator
