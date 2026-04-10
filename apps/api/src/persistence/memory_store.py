"""
Memory Store — Tiers 1 and 2 of the three-layer memory system.

Tier 1 (Hot Cache): agent_memory.json per agent
  - Fast reads (~0ms), injected into every agent invocation
  - Written only during memory consolidation

Tier 2 (Episode Log): logs/YYYY-MM-DD.jsonl per agent
  - Append-only, never edited
  - Read by MemoryConsolidator during idle heartbeat cycles
  - Retained for settings.memory_retention_days
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiofiles

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Base directory for all memory files (mounted as a Docker volume)
_kuzu_path = Path(settings.kuzu_db_path)
MEMORY_BASE = (_kuzu_path.parent.parent if _kuzu_path.suffix else _kuzu_path.parent) / "memory"
MEMORY_BASE.mkdir(parents=True, exist_ok=True)


# ── Tier 1: Hot Cache ─────────────────────────────────────────────────────────

def _hot_cache_path(agent_id: str) -> Path:
    p = MEMORY_BASE / agent_id
    p.mkdir(parents=True, exist_ok=True)
    return p / "agent_memory.json"


async def load_core_memory(agent_id: str) -> dict[str, Any]:
    """Load the agent's hot cache. Returns empty dict if not yet created."""
    path = _hot_cache_path(agent_id)
    if not path.exists():
        return {"agent_id": agent_id, "facts": [], "version": 0}
    try:
        async with aiofiles.open(path) as f:
            return json.loads(await f.read())
    except Exception as exc:
        logger.warning("Failed to read hot cache for %s: %s", agent_id, exc)
        return {"agent_id": agent_id, "facts": [], "version": 0}


async def save_core_memory(agent_id: str, memory: dict[str, Any]) -> None:
    """Atomically write the hot cache (write to .tmp then rename)."""
    path = _hot_cache_path(agent_id)
    tmp = path.with_suffix(".tmp")
    try:
        async with aiofiles.open(tmp, "w") as f:
            await f.write(json.dumps(memory, ensure_ascii=False, indent=2))
        tmp.rename(path)
        logger.debug("Hot cache saved for %s (%d facts)", agent_id, len(memory.get("facts", [])))
    except Exception as exc:
        logger.error("Failed to save hot cache for %s: %s", agent_id, exc)
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise


async def get_memory_context(agent_id: str) -> str:
    """
    Return the hot cache formatted as a prompt injection string.
    Called synchronously (via asyncio) by agents before each invocation.
    """
    memory = await load_core_memory(agent_id)
    facts = memory.get("facts", [])
    if not facts:
        return ""
    lines = ["[MEMORY — hot cache]"]
    for fact in facts:
        content = fact.get("content", fact) if isinstance(fact, dict) else fact
        lines.append(f"• {content}")
    return "\n".join(lines)


# ── Tier 2: Episode Log ───────────────────────────────────────────────────────

def _episode_log_path(agent_id: str, log_date: date | None = None) -> Path:
    d = log_date or date.today()
    p = MEMORY_BASE / agent_id / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{d.isoformat()}.jsonl"


async def append_episode(
    agent_id: str,
    entry_type: str,
    content: str,
    workflow_id: str = "",
    **extra: Any,
) -> str:
    """Append one entry to today's episode log. Returns the entry id."""
    entry_id = str(uuid4())
    entry = {
        "id": entry_id,
        "agent_id": agent_id,
        "workflow_id": workflow_id,
        "timestamp": asyncio.get_event_loop().time(),
        "date": date.today().isoformat(),
        "entry_type": entry_type,
        "content": content,
        **extra,
    }
    path = _episode_log_path(agent_id)
    async with aiofiles.open(path, "a") as f:
        await f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry_id


async def load_recent_episodes(
    agent_id: str,
    days: int | None = None,
) -> list[dict[str, Any]]:
    """Load episode log entries from the past N days."""
    n = days or settings.memory_consolidation_batch_days
    entries: list[dict[str, Any]] = []
    today = date.today()

    for i in range(n):
        log_date = today - timedelta(days=i)
        path = _episode_log_path(agent_id, log_date)
        if not path.exists():
            continue
        try:
            async with aiofiles.open(path) as f:
                async for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
        except Exception as exc:
            logger.warning("Failed to read episode log %s: %s", path, exc)

    return sorted(entries, key=lambda e: e.get("timestamp", 0))


async def prune_old_episodes(agent_id: str) -> int:
    """Delete episode logs older than memory_retention_days. Returns deleted count."""
    cutoff = date.today() - timedelta(days=settings.memory_retention_days)
    logs_dir = MEMORY_BASE / agent_id / "logs"
    if not logs_dir.exists():
        return 0

    deleted = 0
    for log_file in logs_dir.glob("*.jsonl"):
        try:
            log_date = date.fromisoformat(log_file.stem)
            if log_date < cutoff:
                log_file.unlink()
                deleted += 1
        except ValueError:
            pass  # skip non-date filenames

    if deleted:
        logger.info("Pruned %d old episode logs for agent %s", deleted, agent_id)
    return deleted


async def list_agent_ids() -> list[str]:
    """Return all agent IDs that have memory directories."""
    if not MEMORY_BASE.exists():
        return []
    return [p.name for p in MEMORY_BASE.iterdir() if p.is_dir()]
