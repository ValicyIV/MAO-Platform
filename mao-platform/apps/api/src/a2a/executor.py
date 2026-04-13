"""
a2a/executor.py — A2A protocol server endpoints.

Exposes each specialist agent as an A2A-compliant endpoint.
External agents (from other frameworks) can call these via HTTP.

Disabled by default (A2A_ENABLED=false in settings).
Enable in Phase 7 when cross-system agent communication is needed.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncGenerator

import structlog
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.a2a.agent_cards import AGENT_CARDS

log = structlog.get_logger(__name__)
router = APIRouter(tags=["A2A Protocol"])


class A2ATaskRequest(BaseModel):
    id: str = ""
    message: dict
    sessionId: str = ""


@router.get("/.well-known/agent-card.json")
async def agent_card_discovery() -> dict:
    """A2A Agent Card discovery endpoint — describes all available agents."""
    # Return cards for all agents as a multi-agent card
    return {
        "name": "MAO Platform",
        "description": "Multi-Agent Orchestration Platform with specialist agents.",
        "url": "/a2a",
        "version": "0.1.0",
        "agents": [card.to_dict() for card in AGENT_CARDS.values()],
    }


@router.get("/{agent_name}/.well-known/agent-card.json")
async def specialist_agent_card(agent_name: str) -> dict:
    """Per-agent A2A card discovery."""
    card = AGENT_CARDS.get(agent_name)
    if not card:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return card.to_dict()


@router.post("/{agent_name}")
async def a2a_task(agent_name: str, request: A2ATaskRequest) -> StreamingResponse:
    """
    A2A task endpoint — receives a task from an external agent and streams the response.
    Routes to the appropriate specialist agent internally.
    """
    from langchain_core.messages import HumanMessage

    from src.agents.registry import build_agents

    if agent_name not in AGENT_CARDS:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    task_id = request.id or str(uuid.uuid4())
    content = request.message.get("parts", [{}])[0].get("text", "")

    log.info("a2a.task_received", agent=agent_name, task_id=task_id)

    async def stream_response() -> AsyncGenerator[bytes, None]:
        agents = await build_agents()
        agent = agents.get(agent_name)
        if not agent:
            yield b'data: {"type": "error", "message": "Agent not available"}\n\n'
            return

        yield f'data: {{"type": "task_started", "taskId": "{task_id}"}}\n\n'.encode()

        try:
            result = await agent.ainvoke({"messages": [HumanMessage(content=content)]})
            output_msgs = result.get("messages", [])
            final = next(
                (m.content for m in reversed(output_msgs) if hasattr(m, "content") and isinstance(m.content, str)),
                ""
            )
            yield f'data: {{"type": "text", "text": {json.dumps(final)}}}\n\n'.encode()
            yield f'data: {{"type": "task_complete", "taskId": "{task_id}"}}\n\n'.encode()
        except Exception as e:
            log.error("a2a.task_failed", agent=agent_name, error=str(e))
            yield f'data: {{"type": "error", "message": "{e!s}"}}\n\n'.encode()

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
