"""
schemas.py — Pydantic request/response models for all API endpoints.
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field
from datetime import datetime


# ── Workflows ─────────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    task: str = Field(..., min_length=1, max_length=8000, description="The task to execute")
    workflow_id: str | None = Field(None, description="Optional custom workflow ID")
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowResponse(BaseModel):
    workflow_id: str
    status: str
    created_at: datetime
    websocket_url: str


class WorkflowStatus(BaseModel):
    workflow_id: str
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    total_tokens: int
    agents_involved: list[str]
    error: str | None


# ── Agents ────────────────────────────────────────────────────────────────────

class AgentInfo(BaseModel):
    id: str
    name: str
    role: str
    model: str
    tools: list[str]
    description: str


# ── Memory ────────────────────────────────────────────────────────────────────

class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    agent_id: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class MemorySearchResult(BaseModel):
    entity_id: str
    entity_type: str
    label: str
    summary: str | None
    confidence: float
    relevance_score: float
    agent_id: str | None
    updated_at: datetime


class MemoryGraphResponse(BaseModel):
    entities: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    fetched_at: datetime
    agent_filter: str | None
    total_entities: int
    total_relationships: int


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    services: dict[str, str] = Field(default_factory=dict)


# ── Errors ────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    code: str
    detail: str | None = None


# ── Agent config ──────────────────────────────────────────────────────────────

class AgentConfigFull(BaseModel):
    id:                    str
    name:                  str
    role:                  str
    model:                 str
    description:           str
    emoji:                 str
    personality:           str
    system_prompt:         str
    temperature:           float
    thinking_enabled:      bool
    thinking_budget_tokens: int
    memory_enabled:        bool
    is_custom:             bool
    tools:                 list[str]
    # Derived (not stored)
    provider:              str
    display_name:          str
    badge_color:           str


class AgentConfigPatch(BaseModel):
    """Fields the caller may update at runtime."""
    name:                  str | None = None
    model:                 str | None = None
    description:           str | None = None
    emoji:                 str | None = None
    personality:           str | None = None
    system_prompt:         str | None = None
    temperature:           float | None = None
    thinking_enabled:      bool | None = None
    thinking_budget_tokens: int | None = None
    memory_enabled:        bool | None = None
    tools:                 list[str] | None = None


class AgentCreateRequest(BaseModel):
    """Request body for POST /api/agents/config (create new custom agent)."""
    id:                    str = Field(..., pattern=r"^[a-z0-9_-]+$",
                                       description="Unique snake_case ID, e.g. market_analyst")
    name:                  str = Field(..., min_length=1, max_length=60)
    role:                  str = Field(default="custom")
    model:                 str = Field(..., min_length=1)
    description:           str = Field(default="")
    emoji:                 str = Field(default="🤖")
    personality:           str = Field(default="")
    system_prompt:         str = Field(default="")
    temperature:           float = Field(default=1.0, ge=0.0, le=2.0)
    thinking_enabled:      bool = Field(default=False)
    thinking_budget_tokens: int = Field(default=4000, ge=0, le=32000)
    memory_enabled:        bool = Field(default=True)
    tools:                 list[str] = Field(default_factory=list)


class AgentBuilderMeta(BaseModel):
    """Static metadata for the agent builder UI."""
    available_tools:       dict[str, Any]
    role_options:          list[dict[str, str]]
    personality_templates: dict[str, Any]
