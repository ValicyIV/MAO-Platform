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
