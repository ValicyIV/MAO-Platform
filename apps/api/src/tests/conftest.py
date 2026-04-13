"""
conftest.py — Shared pytest fixtures for all test modules.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    """Return the FastAPI test application with mocked external services."""
    with (
        patch("src.observability.telemetry.init_telemetry"),
        patch("src.tools.mcp_tools.init_mcp_client", new_callable=AsyncMock),
        patch("src.persistence.knowledge_graph.knowledge_graph.init", new_callable=AsyncMock),
        patch("src.graph.scheduler.heartbeat_scheduler.run", new_callable=AsyncMock),
    ):
        from src.main import app
        yield app


@pytest.fixture
def client(app):
    """HTTP test client."""
    return TestClient(app)


@pytest.fixture
def mock_anthropic():
    """Mock the Anthropic API to avoid real LLM calls in tests."""
    with patch("langchain_anthropic.ChatAnthropic") as mock_cls:
        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MagicMock(
            content="Test response",
        ))
        mock_llm.bind_tools = MagicMock(return_value=mock_llm)
        mock_cls.return_value = mock_llm
        yield mock_llm


@pytest.fixture
def mock_memory_graph():
    """Mock the knowledge graph to avoid Kuzu in unit tests."""
    with patch("src.persistence.knowledge_graph.knowledge_graph") as mock_kg:
        mock_kg.init = AsyncMock()
        mock_kg.add_memories = AsyncMock()
        mock_kg.search = AsyncMock(return_value=[])
        mock_kg.get_related = AsyncMock(return_value={})
        mock_kg.get_full_graph = AsyncMock(return_value={"entities": [], "relationships": []})
        yield mock_kg


@pytest.fixture
def sample_orchestrator_state():
    """A minimal valid OrchestratorState for graph tests."""
    return {
        "messages": [],
        "next": "supervisor",
        "current_agent": "",
        "agent_outputs": {},
        "mailbox": {},
        "workflow_id": "test-wf-001",
        "task": "Test task",
        "metadata": {},
        "needs_verification": False,
        "completed_agents": [],
        "last_error": None,
        "iteration_count": 0,
    }
