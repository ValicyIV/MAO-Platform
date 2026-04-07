"""
streaming/sse.py — Server-Sent Events endpoint.

Alternative to WebSocket for unidirectional agent event streaming.
Used by AG-UI's HttpAgent client when WebSocket is unavailable
(e.g. behind proxies that don't support WS upgrades).

The primary transport is WebSocket (/ws/{workflow_id}).
This endpoint is the fallback at /agent/stream/{thread_id},
mounted automatically by add_langgraph_fastapi_endpoint() in main.py.
"""

from __future__ import annotations

import json
from typing import AsyncGenerator

import structlog
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from src.streaming.event_mapper import StreamPartMapper
from src.config.settings import settings

log = structlog.get_logger(__name__)
router = APIRouter(tags=["SSE"])


@router.get(
    "/agent/stream/{workflow_id}",
    summary="SSE stream for a workflow (AG-UI fallback transport)",
)
async def sse_stream(workflow_id: str, task: str = "") -> EventSourceResponse:
    """
    Stream agent events as SSE for a given workflow.
    The AG-UI HttpAgent connects here when WebSocket is not available.
    """

    async def event_generator() -> AsyncGenerator[dict, None]:
        from src.graph.graph import graph

        mapper = StreamPartMapper(workflow_id)
        config: dict = {"configurable": {"thread_id": workflow_id}}

        if settings.langfuse_enabled:
            from src.observability.langfuse_handler import get_handler
            config["callbacks"] = [get_handler()]

        yield {"data": json.dumps({"type": "status", "status": "started"})}

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
                },
                config=config,
                version="v2",
            ):
                for event in mapper.map(stream_part):
                    yield {"data": json.dumps(event, default=str)}

            yield {"data": json.dumps({"type": "status", "status": "complete"})}

        except Exception as e:
            log.error("sse.stream_error", workflow_id=workflow_id, error=str(e))
            yield {"data": json.dumps({"type": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())
