"""
routes.py — All REST API endpoints.

Prefixed at /api by main.py.
"""

from __future__ import annotations

import uuid
import time
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, HTTPException, Query

from src.api.schemas import (
    AgentConfigFull,
    AgentConfigPatch,
    AgentCreateRequest,
    AgentBuilderMeta,
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
    from src.agents.registry import get_agent_configs
    return [
        AgentInfo(id=name, name=cfg.name, role=cfg.role,
                  model=cfg.model, tools=[], description=cfg.description)
        for name, cfg in get_agent_configs().items()
    ]



def _cfg_to_full(agent_id: str, cfg) -> "AgentConfigFull":
    from src.agents.model_router import model_display_name, model_badge_color, detect_provider
    return AgentConfigFull(
        id=agent_id,
        name=cfg.name,
        role=cfg.role,
        model=cfg.model,
        description=cfg.description,
        emoji=getattr(cfg, "emoji", "🤖"),
        personality=getattr(cfg, "personality", ""),
        system_prompt=getattr(cfg, "system_prompt", ""),
        temperature=cfg.temperature,
        thinking_enabled=cfg.thinking_enabled,
        thinking_budget_tokens=cfg.thinking_budget_tokens,
        memory_enabled=cfg.memory_enabled,
        is_custom=getattr(cfg, "is_custom", False),
        tools=[t.name if hasattr(t, "name") else str(t) for t in (cfg.tools or [])],
        provider=detect_provider(cfg.model).value,
        display_name=model_display_name(cfg.model),
        badge_color=model_badge_color(cfg.model),
    )

@router.get(
    "/agents/config",
    response_model=list[AgentConfigFull],
    summary="Get full configuration for all agents",
)
async def get_all_agent_configs() -> list[AgentConfigFull]:
    """Returns resolved configs (code defaults merged with env + file overrides)."""
    from src.agents.registry import get_agent_configs
    return [_cfg_to_full(name, cfg) for name, cfg in get_agent_configs().items()]


@router.get(
    "/agents/config/{agent_name}",
    response_model=AgentConfigFull,
    summary="Get configuration for one agent",
)
async def get_agent_config(agent_name: str) -> AgentConfigFull:
    from src.agents.registry import get_agent_configs
    configs = get_agent_configs()
    if agent_name not in configs:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return _cfg_to_full(agent_name, configs[agent_name])


@router.patch(
    "/agents/config/{agent_name}",
    response_model=AgentConfigFull,
    summary="Update one agent's configuration at runtime",
)
async def patch_agent_config(agent_name: str, patch: AgentConfigPatch) -> AgentConfigFull:
    """
    Partially update an agent's config. Changes are persisted to data/agents.json
    and take effect on the next workflow execution (agents are rebuilt automatically).

    Only the fields included in the request body are changed.
    """
    from src.agents.registry import update_agent_config

    # Validate agent name
    from src.agents.registry import get_agent_configs
    if agent_name not in get_agent_configs():
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    update_patch = patch.model_dump(exclude_none=True)
    if not update_patch:
        raise HTTPException(status_code=422, detail="No fields to update")

    cfg = update_agent_config(agent_name, update_patch)
    log.info("agent_config.patched", agent=agent_name, patch=update_patch)
    return _cfg_to_full(agent_name, cfg)


@router.post(
    "/agents/config/{agent_name}/reset",
    response_model=AgentConfigFull,
    summary="Reset one agent to its default configuration",
)
async def reset_agent_config_endpoint(agent_name: str) -> AgentConfigFull:
    """Remove all file overrides for this agent, reverting to env/code defaults."""
    from src.agents.registry import reset_agent_config, get_agent_configs

    if agent_name not in get_agent_configs():
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    cfg = reset_agent_config(agent_name)
    return _cfg_to_full(agent_name, cfg)




# ── Agent builder metadata ────────────────────────────────────────────────────

@router.get("/agents/builder/meta", response_model=AgentBuilderMeta, summary="Metadata for the agent builder UI")
async def get_builder_meta() -> AgentBuilderMeta:
    from src.agents.registry import AVAILABLE_TOOLS, ROLE_OPTIONS, PERSONALITY_TEMPLATES
    return AgentBuilderMeta(
        available_tools=AVAILABLE_TOOLS,
        role_options=ROLE_OPTIONS,
        personality_templates=PERSONALITY_TEMPLATES,
    )


# ── Create custom agent ───────────────────────────────────────────────────────

@router.post("/agents/config", response_model=AgentConfigFull, status_code=201,
             summary="Create a new custom agent")
async def create_agent(body: AgentCreateRequest) -> AgentConfigFull:
    from src.agents.registry import create_agent as _create
    cfg_dict = body.model_dump(exclude={"id"})
    try:
        cfg = _create(body.id, cfg_dict)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    log.info("agent.created id=%s model=%s", body.id, body.model)
    return _cfg_to_full(body.id, cfg)


# ── Delete custom agent ───────────────────────────────────────────────────────

@router.delete("/agents/config/{agent_name}", status_code=204,
               summary="Delete a custom agent (built-ins cannot be deleted)")
async def delete_agent(agent_name: str) -> None:
    from src.agents.registry import delete_agent as _delete
    try:
        _delete(agent_name)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    log.info("agent.deleted id=%s", agent_name)

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
        fetchedAt=int(time.time() * 1000),
        agentFilter=agent_id,
        totalEntities=len(dump["entities"]),
        totalRelationships=len(dump["relationships"]),
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
