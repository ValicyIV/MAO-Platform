"""
websocket.py — WebSocket server and ConnectionManager.

Handles real-time bidirectional communication between the frontend
graph UI and the backend agent orchestration engine.

Each workflow gets its own "room" — clients subscribe by workflow_id.
The heartbeat scheduler broadcasts to all rooms via broadcast_all().
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from src.config.settings import settings
from src.streaming.event_mapper import StreamPartMapper

log = structlog.get_logger(__name__)
router = APIRouter(tags=["WebSocket"])


# ── Connection Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    """
    Manages all active WebSocket connections, grouped by workflow_id.
    Thread-safe for use within a single asyncio event loop.
    """

    def __init__(self) -> None:
        # { workflow_id: set of active WebSocket connections }
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # { workflow_id: running workflow task }
        self._workflow_tasks: dict[str, asyncio.Task[None]] = {}
        # Lightweight run metadata for GET /api/workflows/{id} (in-process; replace with Redis in multi-worker)
        self._workflow_snapshots: dict[str, dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, workflow_id: str) -> None:
        await websocket.accept()
        self._rooms[workflow_id].add(websocket)
        log.info("ws.connected", workflow_id=workflow_id, total=len(self._rooms[workflow_id]))

        # Send initial connected message
        await self._send(websocket, {
            "type": "connected",
            "sessionId": workflow_id,
            "serverVersion": "0.1.0",
            "capabilities": ["streaming", "memory_updates", "heartbeat"],
        })

    def disconnect(self, websocket: WebSocket, workflow_id: str) -> None:
        self._rooms[workflow_id].discard(websocket)
        if not self._rooms[workflow_id]:
            del self._rooms[workflow_id]
        log.info("ws.disconnected", workflow_id=workflow_id)

    async def broadcast(self, message: dict[str, Any], workflow_id: str) -> None:
        """Send a message to all clients subscribed to a workflow."""
        room = self._rooms.get(workflow_id, set())
        dead: list[WebSocket] = []
        for ws in list(room):
            try:
                await self._send(ws, message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, workflow_id)

    async def broadcast_all(self, message: dict[str, Any]) -> None:
        """Send a message to all connected clients (used by heartbeat scheduler)."""
        for workflow_id in list(self._rooms.keys()):
            await self.broadcast(message, workflow_id)

    def active_workflow_count(self) -> int:
        return len(self._rooms)

    def get_workflow_snapshot(self, workflow_id: str) -> dict[str, Any] | None:
        """Last known state for a workflow run (in-process only)."""
        return self._workflow_snapshots.get(workflow_id)

    def _init_workflow_snapshot(self, workflow_id: str) -> None:
        now = time.time()
        self._workflow_snapshots[workflow_id] = {
            "started_at": now,
            "finished_at": None,
            "status": "running",
            "agents_involved": [],
            "total_tokens": 0,
            "error": None,
        }

    def _finalize_workflow_snapshot(
        self, workflow_id: str, *, status: str, error: str | None = None
    ) -> None:
        snap = self._workflow_snapshots.get(workflow_id)
        if not snap or snap.get("status") != "running":
            return
        snap["finished_at"] = time.time()
        snap["status"] = status
        if error is not None:
            snap["error"] = error

    def note_stream_event(self, workflow_id: str, event: dict[str, Any]) -> None:
        snap = self._workflow_snapshots.get(workflow_id)
        if not snap:
            return
        et = event.get("type")
        if et == "RUN_STARTED":
            aid = event.get("agentId")
            if aid and aid not in snap["agents_involved"]:
                snap["agents_involved"].append(aid)
        elif et == "RUN_FINISHED":
            snap["total_tokens"] += int(event.get("totalTokens") or 0)

    async def _send(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.send_text(json.dumps(message, default=str))

    async def start_workflow(self, workflow_id: str, task: str) -> None:
        """Start streaming a workflow to connected clients."""
        if workflow_id in self._workflow_tasks:
            log.warning("ws.workflow_already_running", workflow_id=workflow_id)
            return

        self._init_workflow_snapshot(workflow_id)

        task_obj = asyncio.create_task(
            self._stream_workflow(workflow_id, task),
            name=f"workflow-{workflow_id}",
        )
        self._workflow_tasks[workflow_id] = task_obj

        def on_done(fut: asyncio.Future[None]) -> None:
            self._workflow_tasks.pop(workflow_id, None)
            if fut.exception():
                log.error("ws.workflow_error", workflow_id=workflow_id, error=str(fut.exception()))

        task_obj.add_done_callback(on_done)

    async def cancel_workflow(self, workflow_id: str) -> None:
        task = self._workflow_tasks.get(workflow_id)
        if task:
            task.cancel()
            self._finalize_workflow_snapshot(workflow_id, status="cancelled")
            await self.broadcast(
                {"type": "status", "workflowId": workflow_id, "status": "cancelled"},
                workflow_id,
            )

    async def _stream_workflow(self, workflow_id: str, task: str) -> None:
        """Stream the full LangGraph execution to WebSocket clients."""
        from src.graph.graph import graph
        from src.observability.langfuse_handler import get_handler

        mapper = StreamPartMapper(workflow_id)

        # Broadcast run started
        await self.broadcast({
            "type": "status",
            "workflowId": workflow_id,
            "status": "started",
        }, workflow_id)

        config: dict[str, Any] = {
            "configurable": {"thread_id": workflow_id},
            "run_name": f"workflow_{workflow_id}",
            "recursion_limit": 50,  # bumped from default 25; iteration guard in supervisor is the real safety net
        }
        if settings.langfuse_enabled:
            config["callbacks"] = [get_handler()]

        try:
            async for stream_part in graph.astream_events(
                {
                    "messages": [],
                    "task": task,
                    "workflow_id": workflow_id,
                    "next": "supervisor",
                    "current_agent": "",
                    "agent_outputs": {},
                    "mailbox": {},
                    "metadata": {},
                    "needs_verification": False,
                    "completed_agents": [],
                    "last_error": None,
                    "iteration_count": 0,
                },
                config=config,
                version="v2",
            ):
                mapped_events = mapper.map(stream_part)
                for event in mapped_events:
                    self.note_stream_event(workflow_id, event)
                    await self.broadcast(
                        {"type": "event", "workflowId": workflow_id, "event": event},
                        workflow_id,
                    )

            self._finalize_workflow_snapshot(workflow_id, status="complete")
            await self.broadcast({
                "type": "status",
                "workflowId": workflow_id,
                "status": "complete",
            }, workflow_id)

        except asyncio.CancelledError:
            self._finalize_workflow_snapshot(workflow_id, status="cancelled")
            raise
        except Exception as e:
            log.error("ws.stream_error", workflow_id=workflow_id, error=str(e))
            self._finalize_workflow_snapshot(workflow_id, status="error", error=str(e))
            await self.broadcast({
                "type": "error",
                "code": "STREAM_ERROR",
                "message": str(e),
                "workflowId": workflow_id,
            }, workflow_id)


# Module-level singleton
connection_manager = ConnectionManager()


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/{workflow_id}")
async def websocket_endpoint(websocket: WebSocket, workflow_id: str) -> None:
    await connection_manager.connect(websocket, workflow_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "execute":
                task = msg.get("task", "")
                if task:
                    await connection_manager.start_workflow(workflow_id, task)

            elif msg_type == "cancel":
                await connection_manager.cancel_workflow(workflow_id)

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": msg.get("timestamp", 0),
                    "serverTimestamp": int(time.time() * 1000),
                }))

    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, workflow_id)
    except Exception as e:
        log.error("ws.handler_error", workflow_id=workflow_id, error=str(e))
        connection_manager.disconnect(websocket, workflow_id)
