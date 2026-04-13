"""
test_recursion_guard.py — Tests for the recursion prevention system.

Covers:
  1. iteration_count increments in OrchestratorState
  2. supervisor_node force-completes at MAX_SUPERVISOR_ITERATIONS
  3. should_continue edge returns END when is_complete or error is set
  4. should_verify routes correctly based on output content
  5. route_to_agent validates agent names
  6. Full graph compilation with the new conditional edges
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langgraph.graph import END


# ── Edge function tests ───────────────────────────────────────────────────────


class TestShouldContinue:
    """should_continue: routes to END if complete/error, else supervisor."""

    def test_returns_end_when_complete(self):
        from src.graph.edges import should_continue
        state = {"is_complete": True, "error": None}
        assert should_continue(state) == END

    def test_returns_end_when_error(self):
        from src.graph.edges import should_continue
        state = {"is_complete": False, "error": "something broke"}
        assert should_continue(state) == END

    def test_returns_supervisor_when_not_complete(self):
        from src.graph.edges import should_continue
        state = {"is_complete": False, "error": None}
        assert should_continue(state) == "supervisor"

    def test_returns_supervisor_when_fields_missing(self):
        from src.graph.edges import should_continue
        state = {}
        assert should_continue(state) == "supervisor"


class TestRouteToAgent:
    """route_to_agent: validates agent names, returns END for invalid."""

    def test_routes_to_valid_agent(self):
        from src.graph.edges import route_to_agent
        for agent in ("research", "code", "data", "writer"):
            assert route_to_agent({"next": agent}) == agent

    def test_returns_end_for_finish(self):
        from src.graph.edges import route_to_agent
        assert route_to_agent({"next": "FINISH"}) == END

    def test_returns_end_for_empty(self):
        from src.graph.edges import route_to_agent
        assert route_to_agent({"next": ""}) == END

    def test_returns_end_for_unknown_agent(self):
        from src.graph.edges import route_to_agent
        assert route_to_agent({"next": "nonexistent"}) == END

    def test_returns_end_for_missing_next(self):
        from src.graph.edges import route_to_agent
        assert route_to_agent({}) == END


class TestShouldVerify:
    """should_verify: routes to verifier when output has edit indicators."""

    def test_routes_to_supervisor_when_no_output(self):
        from src.graph.edges import should_verify
        state = {"agent_outputs": {}, "current_agent": "research"}
        assert should_verify(state) == "supervisor"

    def test_routes_to_supervisor_when_no_edits(self):
        from src.graph.edges import should_verify
        state = {
            "agent_outputs": {"code": "I analyzed the data and found patterns."},
            "current_agent": "code",
        }
        with patch("src.config.settings.settings") as mock_settings:
            mock_settings.verification_threshold = 2
            assert should_verify(state) == "supervisor"

    def test_routes_to_verifier_when_edits_exceed_threshold(self):
        from src.graph.edges import should_verify
        state = {
            "agent_outputs": {"code": "I used write_file to create_file and edit_file."},
            "current_agent": "code",
        }
        with patch("src.config.settings.settings") as mock_settings:
            mock_settings.verification_threshold = 2
            assert should_verify(state) == "verifier"


# ── Supervisor iteration guard tests ──────────────────────────────────────────


class TestSupervisorIterationGuard:
    """supervisor_node: force-completes after MAX_SUPERVISOR_ITERATIONS."""

    @pytest.mark.asyncio
    async def test_force_completes_at_max_iterations(self):
        from src.graph.supervisor import MAX_SUPERVISOR_ITERATIONS, supervisor_node

        state = {
            "iteration_count": MAX_SUPERVISOR_ITERATIONS,  # will become MAX+1 inside
            "task": "test task",
            "agent_outputs": {"research": "some output", "code": "other output"},
            "workflow_id": "test-wf",
        }

        # No LLM call should happen — the guard triggers first
        result = await supervisor_node(state)

        assert result["next"] == END
        assert result["is_complete"] is True
        assert result["iteration_count"] == MAX_SUPERVISOR_ITERATIONS + 1
        assert "automatically completed" in result["agent_outputs"]["supervisor"]
        assert "2 agents" in result["agent_outputs"]["supervisor"]

    @pytest.mark.asyncio
    async def test_iteration_increments_on_routing(self):
        """When the LLM routes to an agent, iteration_count should be incremented."""
        from src.graph.supervisor import supervisor_node

        mock_response = MagicMock()
        mock_response.tool_calls = [{
            "name": "route_to_agent",
            "args": {"agent_name": "research", "task": "do research", "reason": "needed"},
        }]

        mock_llm = MagicMock()
        mock_llm.bind_tools = MagicMock(return_value=mock_llm)
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)

        state = {
            "iteration_count": 3,
            "task": "test task",
            "agent_outputs": {},
            "workflow_id": "test-wf",
        }

        with (
            patch("src.agents.model_router.get_chat_model", return_value=mock_llm),
            patch("src.agents.registry.get_agent_configs", return_value={}),
            patch("src.config.prompts.get_prompt", return_value="test prompt"),
            patch("src.persistence.memory_retriever.get_context", new_callable=AsyncMock, return_value=""),
            patch("src.config.settings.settings") as mock_settings,
        ):
            mock_settings.default_model = "test-model"
            mock_settings.langfuse_enabled = False
            result = await supervisor_node(state)

        assert result["iteration_count"] == 4
        assert result["next"] == "research"

    @pytest.mark.asyncio
    async def test_iteration_increments_on_completion(self):
        """When the LLM completes, iteration_count should still be set."""
        from src.graph.supervisor import supervisor_node

        mock_response = MagicMock()
        mock_response.tool_calls = [{
            "name": "complete_workflow",
            "args": {"summary": "All done"},
        }]

        mock_llm = MagicMock()
        mock_llm.bind_tools = MagicMock(return_value=mock_llm)
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)

        state = {
            "iteration_count": 5,
            "task": "test task",
            "agent_outputs": {},
            "workflow_id": "test-wf",
        }

        with (
            patch("src.agents.model_router.get_chat_model", return_value=mock_llm),
            patch("src.agents.registry.get_agent_configs", return_value={}),
            patch("src.config.prompts.get_prompt", return_value="test prompt"),
            patch("src.persistence.memory_retriever.get_context", new_callable=AsyncMock, return_value=""),
            patch("src.config.settings.settings") as mock_settings,
        ):
            mock_settings.default_model = "test-model"
            mock_settings.langfuse_enabled = False
            result = await supervisor_node(state)

        assert result["iteration_count"] == 6
        assert result["is_complete"] is True
        assert result["next"] == END

    @pytest.mark.asyncio
    async def test_iteration_starts_at_zero(self):
        """First supervisor call should set iteration_count to 1."""
        from src.graph.supervisor import supervisor_node

        mock_response = MagicMock()
        mock_response.tool_calls = [{
            "name": "complete_workflow",
            "args": {"summary": "Quick finish"},
        }]

        mock_llm = MagicMock()
        mock_llm.bind_tools = MagicMock(return_value=mock_llm)
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)

        state = {
            "task": "test task",
            "agent_outputs": {},
            "workflow_id": "test-wf",
            # No iteration_count — should default to 0
        }

        with (
            patch("src.agents.model_router.get_chat_model", return_value=mock_llm),
            patch("src.agents.registry.get_agent_configs", return_value={}),
            patch("src.config.prompts.get_prompt", return_value="test prompt"),
            patch("src.persistence.memory_retriever.get_context", new_callable=AsyncMock, return_value=""),
            patch("src.config.settings.settings") as mock_settings,
        ):
            mock_settings.default_model = "test-model"
            mock_settings.langfuse_enabled = False
            result = await supervisor_node(state)

        assert result["iteration_count"] == 1


# ── Graph compilation test ────────────────────────────────────────────────────


class TestGraphCompilation:
    """Verify the graph compiles with the new conditional edges."""

    def test_graph_builds_without_error(self):
        with patch("src.persistence.checkpointer.get_checkpointer", return_value=MagicMock()):
            from src.graph.graph import build_graph
            workflow = build_graph()
            # Should have all nodes
            node_names = set(workflow.nodes.keys())
            assert "supervisor" in node_names
            assert "research" in node_names
            assert "code" in node_names
            assert "data" in node_names
            assert "writer" in node_names
            assert "verifier" in node_names


# ── Memory episode logging test ───────────────────────────────────────────────


class TestMemoryEpisodeLogging:
    """Verify that agent_node logs both llm_call and tool_call episodes."""

    @pytest.mark.asyncio
    async def test_tool_calls_logged_as_episodes(self):
        from src.graph.nodes import agent_node

        # Create a mock agent that returns tool call messages
        mock_tool_msg = MagicMock()
        mock_tool_msg.tool_calls = [
            {"name": "web_search", "args": {"query": "AI trends"}},
            {"name": "read_file", "args": {"path": "/test.py"}},
        ]
        mock_tool_msg.content = "I searched and read a file."

        mock_agent = MagicMock()
        mock_agent.ainvoke = AsyncMock(return_value={
            "messages": [mock_tool_msg],
        })

        state = {
            "task": "test task",
            "workflow_id": "wf-test",
        }

        with patch("src.persistence.memory_retriever.get_context", new_callable=AsyncMock, return_value=""):
            with patch("src.persistence.memory_store.append_episode", new_callable=AsyncMock) as mock_append:
                result = await agent_node(state, mock_agent, "research")

        # Should have been called 3 times: 1 llm_call + 2 tool_calls
        assert mock_append.call_count == 3

        # First call: llm_call
        assert mock_append.call_args_list[0][0][1] == "llm_call"

        # Second call: tool_call for web_search
        assert mock_append.call_args_list[1][0][1] == "tool_call"
        assert "web_search" in mock_append.call_args_list[1][0][2]
        assert mock_append.call_args_list[1][1]["toolName"] == "web_search"

        # Third call: tool_call for read_file
        assert mock_append.call_args_list[2][0][1] == "tool_call"
        assert "read_file" in mock_append.call_args_list[2][0][2]
        assert mock_append.call_args_list[2][1]["toolName"] == "read_file"
