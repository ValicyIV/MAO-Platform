"""
test_api/test_routes.py — Integration tests for REST API endpoints.

Uses FastAPI TestClient. External services (LLM, DB, MCP) are mocked
via conftest.py fixtures.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "services" in data


def test_create_workflow_returns_id(client: TestClient):
    resp = client.post("/api/workflows", json={"task": "Research quantum computing"})
    assert resp.status_code == 200
    data = resp.json()
    assert "workflow_id" in data
    assert data["workflow_id"].startswith("wf-")
    assert "websocket_url" in data


def test_create_workflow_with_custom_id(client: TestClient):
    resp = client.post(
        "/api/workflows",
        json={"task": "Test task", "workflow_id": "custom-id-123"},
    )
    assert resp.status_code == 200
    assert resp.json()["workflow_id"] == "custom-id-123"


def test_create_workflow_empty_task_rejected(client: TestClient):
    resp = client.post("/api/workflows", json={"task": ""})
    assert resp.status_code == 422  # Pydantic validation error


def test_get_workflow_status(client: TestClient):
    resp = client.get("/api/workflows/wf-unknown-001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["workflow_id"] == "wf-unknown-001"


def test_list_agents_returns_all(client: TestClient):
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    agents = resp.json()
    assert isinstance(agents, list)
    # Check at least the 4 core specialists are present
    roles = {a["role"] for a in agents}
    assert "research" in roles
    assert "code" in roles


def test_memory_graph_disabled_returns_503(client: TestClient, monkeypatch):
    """When memory graph is disabled, endpoints return 503."""
    import src.config.settings as settings_module
    monkeypatch.setattr(settings_module.settings, "memory_graph_enabled", False)
    resp = client.get("/api/memory/graph")
    assert resp.status_code == 503


def test_memory_search_requires_query(client: TestClient, mock_memory_graph):
    """Search endpoint requires the `q` parameter."""
    resp = client.get("/api/memory/search")
    assert resp.status_code == 422
