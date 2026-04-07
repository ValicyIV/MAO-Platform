"""
scheduler.py — Heartbeat scheduler (OpenClaw Pattern 6 / Kairos mode).

Runs a background asyncio loop on a configurable interval.
Each beat:
  1. Emits a heartbeat event to all connected WebSocket clients
  2. Triggers memory consolidation for idle agents (Pattern 8)
  3. Prunes stale episode logs beyond retention window

The scheduler is started as an asyncio.Task in main.py lifespan.
"""

from __future__ import annotations

import asyncio
import time

import structlog

from src.config.settings import settings

log = structlog.get_logger(__name__)


class HeartbeatScheduler:
    """Background scheduler — one instance per process."""

    def __init__(self) -> None:
        self._running = False
        self._beat_count = 0

    async def run(self) -> None:
        """Main loop — runs until cancelled."""
        self._running = True
        log.info("scheduler.loop_started", interval=settings.heartbeat_interval)

        while self._running:
            try:
                await asyncio.sleep(settings.heartbeat_interval)
                await self._beat()
            except asyncio.CancelledError:
                log.info("scheduler.cancelled")
                break
            except Exception as e:
                log.error("scheduler.beat_error", error=str(e))
                # Keep running despite errors
                await asyncio.sleep(5)

    async def _beat(self) -> None:
        self._beat_count += 1
        beat_start = time.monotonic()

        # 1. Broadcast heartbeat to all WS clients
        consolidation_pending = await self._check_consolidation_pending()
        await self._broadcast_heartbeat(consolidation_pending)

        # 2. Memory consolidation (every N beats, not every beat)
        if self._beat_count % self._consolidation_every == 0:
            await self._run_consolidation()

        # 3. Prune stale episode logs
        if self._beat_count % self._prune_every == 0:
            await self._prune_stale_logs()

        duration_ms = round((time.monotonic() - beat_start) * 1000, 1)
        log.debug("scheduler.beat_complete", beat=self._beat_count, duration_ms=duration_ms)

    @property
    def _consolidation_every(self) -> int:
        """Run consolidation every 10 beats (5 min at 30s interval)."""
        return 10

    @property
    def _prune_every(self) -> int:
        """Prune logs every 48 beats (~24h at 30s interval)."""
        return 48 * 2  # twice daily

    async def _check_consolidation_pending(self) -> bool:
        """Check if any agent has unprocessed episodes."""
        try:
            from src.persistence.memory_store import memory_store
            return await memory_store.has_unprocessed_episodes()
        except Exception:
            return False

    async def _broadcast_heartbeat(self, consolidation_pending: bool) -> None:
        """Broadcast heartbeat event to all active WebSocket connections."""
        try:
            from src.streaming.websocket import connection_manager
            await connection_manager.broadcast_all({
                "type": "event",
                "event": {
                    "type": "CUSTOM",
                    "customType": "heartbeat",
                    "payload": {
                        "timestamp": int(time.time() * 1000),
                        "activeWorkflows": connection_manager.active_workflow_count(),
                        "consolidationPending": consolidation_pending,
                    },
                },
            })
        except Exception as e:
            log.debug("scheduler.heartbeat_broadcast_failed", error=str(e))

    async def _run_consolidation(self) -> None:
        """Run memory consolidation for all agents with pending episodes."""
        if not settings.memory_graph_enabled:
            return
        try:
            from src.persistence.memory_consolidator import memory_consolidator
            result = await memory_consolidator.consolidate_all()
            if result["agents_processed"] > 0:
                log.info(
                    "consolidation.complete",
                    agents=result["agents_processed"],
                    kg_nodes_added=result["total_kg_nodes_added"],
                    conflicts=result["total_conflicts"],
                )
        except Exception as e:
            log.error("consolidation.failed", error=str(e))

    async def _prune_stale_logs(self) -> None:
        """Remove episode log files older than MEMORY_RETENTION_DAYS."""
        try:
            from src.persistence.memory_store import memory_store
            pruned = await memory_store.prune_old_episodes(
                days=settings.memory_retention_days
            )
            if pruned > 0:
                log.info("scheduler.logs_pruned", files_removed=pruned)
        except Exception as e:
            log.warning("scheduler.prune_failed", error=str(e))


# Module-level singleton
heartbeat_scheduler = HeartbeatScheduler()
