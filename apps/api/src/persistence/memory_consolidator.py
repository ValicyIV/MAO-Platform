"""
Memory Consolidator — Pattern 8: Background Memory Consolidation.

Runs during idle heartbeat cycles (Pattern 6). Three stages per agent:

  Stage 1 — Hot cache update (Haiku sub-agent)
    Reads recent episodes, rewrites agent_memory.json with deduped/pruned facts.

  Stage 2 — Knowledge graph extraction (Mem0g pipeline)
    Passes episode text through Mem0g: entity extraction → relation inference
    → conflict detection → write to Kuzu.

  Stage 3 — Procedural memory update (LangMem)
    Detects repeated tool-use patterns and updates procedural memory.

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
        """Stage 1: Use Claude Haiku to extract facts from episodes."""
        from anthropic import AsyncAnthropic
        from src.config.prompts import get_prompt

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        current = await load_core_memory(agent_id)
        current_facts = json.dumps(current.get("facts", []), indent=2)

        prompt = get_prompt(
            "consolidation",
            agent_role=agent_id,
            current_memory=current_facts,
            episodes=episodes_text[:6000],  # hard cap to avoid token overrun
            days=str(settings.memory_consolidation_batch_days),
        )

        response = await client.messages.create(
            model="claude-haiku-4-5",  # cheapest model for this task
            max_tokens=2000,
            system=prompt,
            messages=[{"role": "user", "content": "Consolidate the memory now."}],
        )

        content = response.content[0].text if response.content else "{}"
        try:
            parsed = json.loads(content)
            return parsed.get("facts", [])
        except json.JSONDecodeError:
            logger.warning("Consolidation LLM returned non-JSON for %s", agent_id)
            return []

    async def _update_procedural(
        self, agent_id: str, episodes: list[dict[str, Any]]
    ) -> list[str]:
        """Stage 3: Detect repeated tool-use patterns and update LangMem."""
        # Count tool usage frequencies
        tool_counts: dict[str, int] = {}
        for episode in episodes:
            if episode.get("entry_type") == "tool_call":
                tool = episode.get("tool_name", "")
                if tool:
                    tool_counts[tool] = tool_counts.get(tool, 0) + 1

        patterns = []
        for tool, count in tool_counts.items():
            if count >= 3:  # repeated 3+ times = a pattern
                patterns.append(f"Uses {tool} frequently ({count} times in recent history)")

        # Try to persist via LangMem if available
        try:
            from langmem import create_memory_store  # type: ignore[import]
            store = create_memory_store()
            for pattern in patterns:
                await store.aput(
                    (agent_id, "procedural"),
                    key=f"pattern_{hash(pattern)}",
                    value={"pattern": pattern, "agent_id": agent_id},
                )
        except Exception:
            pass  # LangMem optional

        return patterns


def _format_episodes(episodes: list[dict[str, Any]]) -> str:
    """Format episode list as a readable text for LLM processing."""
    lines = []
    for ep in episodes[-50:]:  # last 50 entries max
        ts = ep.get("date", "")
        entry_type = ep.get("entry_type", "")
        content = ep.get("content", "")
        tool = ep.get("tool_name", "")
        prefix = f"[{ts}] [{entry_type}]"
        if tool:
            prefix += f" tool={tool}"
        lines.append(f"{prefix}: {content[:300]}")
    return "\n".join(lines)


# Singleton
consolidator = MemoryConsolidator()
