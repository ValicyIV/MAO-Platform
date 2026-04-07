"""
routes.py — All REST API endpoints.

Prefixed at /api by main.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException, Query

from src.api.schemas import (
    AgentInfo,
    ErrorResponse,
    HealthResponse,
    MemoryGraphResponse,
    MemorySearchRequest,
    MemorySearchResult,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowStatus,
)
from src.config.settings import settings

log = structlog.get_logger(__name__)
router = APIRouter(tags=["MAO Platform"])


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse, summary="Liveness check")
async def health() -> HealthResponse:
    services: dict[str, str] = {}

    # Check Langfuse connectivity
    services["langfuse"] = "enabled" if settings.langfuse_enabled else "disabled"

    # Check memory graph
    services["memory_graph"] = "enabled" if settings.memory_graph_enabled else "disabled"

    return HealthResponse(status="ok", version="0.1.0", services=services)


# ── Workflows ─────────────────────────────────────────────────────────────────

@router.post("/workflows", response_model=WorkflowResponse, summary="Create and start a workflow")
async def create_workflow(body: WorkflowCreate) -> WorkflowResponse:
    workflow_id = body.workflow_id or f"wf-{uuid.uuid4().hex[:12]}"
    ws_url = f"ws://localhost:{settings.api_port}/ws/{workflow_id}"

    log.info("workflow.created", workflow_id=workflow_id, task_preview=body.task[:80])

    return WorkflowResponse(
        workflow_id=workflow_id,
        status="created",
        created_at=datetime.now(tz=timezone.utc),
        websocket_url=ws_url,
    )


@router.get("/workflows/{workflow_id}", response_model=WorkflowStatus, summary="Get workflow status")
async def get_workflow(workflow_id: str) -> WorkflowStatus:
    # TODO: pull from Redis/checkpointer in Phase 6
    return WorkflowStatus(
        workflow_id=workflow_id,
        status="unknown",
        started_at=None,
        finished_at=None,
        total_tokens=0,
        agents_involved=[],
        error=None,
    )


@router.post("/workflows/{workflow_id}/cancel", summary="Cancel a running workflow")
async def cancel_workflow(workflow_id: str) -> dict[str, str]:
    log.info("workflow.cancel_requested", workflow_id=workflow_id)
    # Cancellation is handled by the WebSocket handler broadcasting a cancel event
    return {"status": "cancel_requested", "workflow_id": workflow_id}


# ── Agents ────────────────────────────────────────────────────────────────────

@router.get("/agents", response_model=list[AgentInfo], summary="List available agents")
async def list_agents() -> list[AgentInfo]:
    from src.agents.registry import AGENTS
    return [
        AgentInfo(
            id=name,
            name=cfg.name,
            role=cfg.role,
            model=cfg.model,
            tools=cfg.tools,
            description=cfg.description,
        )
        for name, cfg in AGENTS.items()
    ]


# ── Memory ────────────────────────────────────────────────────────────────────

@router.get(
    "/memory/graph",
    response_model=MemoryGraphResponse,
    summary="Get full knowledge graph for Memory Graph UI",
)
async def get_memory_graph(
    agent_id: str | None = Query(None, description="Filter to a specific agent's subgraph"),
) -> MemoryGraphResponse:
    if not settings.memory_graph_enabled:
        raise HTTPException(status_code=503, detail="Memory graph is disabled")

    from src.persistence.knowledge_graph import knowledge_graph
    dump = await knowledge_graph.get_full_graph(agent_id=agent_id)

    return MemoryGraphResponse(
        entities=dump["entities"],
        relationships=dump["relationships"],
        fetched_at=datetime.now(tz=timezone.utc),
        agent_filter=agent_id,
        total_entities=len(dump["entities"]),
        total_relationships=len(dump["relationships"]),
    )


@router.get(
    "/memory/graph/{agent_id}",
    response_model=MemoryGraphResponse,
    summary="Get agent-specific knowledge subgraph",
)
async def get_agent_memory_graph(agent_id: str) -> MemoryGraphResponse:
    return await get_memory_graph(agent_id=agent_id)


@router.get(
    "/memory/search",
    response_model=list[MemorySearchResult],
    summary="Hybrid search over the knowledge graph",
)
async def search_memory(
    q: str = Query(..., min_length=1, description="Search query"),
    agent_id: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
) -> list[MemorySearchResult]:
    if not settings.memory_graph_enabled:
        raise HTTPException(status_code=503, detail="Memory graph is disabled")

    from src.persistence.knowledge_graph import knowledge_graph
    results = await knowledge_graph.search(query=q, agent_id=agent_id, limit=limit)

    return [
        MemorySearchResult(
            entity_id=r["id"],
            entity_type=r["entity_type"],
            label=r["label"],
            summary=r.get("summary"),
            confidence=r.get("confidence", 1.0),
            relevance_score=r.get("score", 0.0),
            agent_id=r.get("agent_id"),
            updated_at=datetime.fromtimestamp(r["updated_at"] / 1000, tz=timezone.utc),
        )
        for r in results
    ]


@router.delete(
    "/memory/{entity_id}",
    summary="Remove an entity from the knowledge graph",
)
async def delete_memory(entity_id: str) -> dict[str, str]:
    if not settings.memory_graph_enabled:
        raise HTTPException(status_code=503, detail="Memory graph is disabled")

    from src.persistence.knowledge_graph import knowledge_graph
    await knowledge_graph.delete_entity(entity_id)
    log.info("memory.entity_deleted", entity_id=entity_id)
    return {"status": "deleted", "entity_id": entity_id}
