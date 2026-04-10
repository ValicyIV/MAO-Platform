"""
Node wrapper functions — Pattern 1 (fork-cache), Pattern 9 (privacy routing).

Each node function wraps a compiled agent, handles memory injection,
emits custom streaming events, and returns the state update.
"""
from __future__ import annotations
import asyncio
import inspect
import logging
import time
from typing import Any
from langchain_core.messages import HumanMessage
from src.graph.state import OrchestratorState
from src.observability.telemetry import observe

logger = logging.getLogger(__name__)


async def _emit_writer_event(writer: Any, payload: dict[str, Any]) -> None:
    result = writer(payload)
    if inspect.isawaitable(result):
        await result


@observe("graph.agent_node")
async def agent_node(
    state: OrchestratorState,
    agent: Any,
    agent_id: str,
    writer: Any = None,
) -> dict[str, Any]:
    """
    Execute a specialist agent and return its output as a state update.

    Args:
        state:    current OrchestratorState
        agent:    compiled LangChain agent (from create_react_agent)
        agent_id: e.g. "research_agent"
        writer:   LangGraph custom event writer for AG-UI streaming
    """
    from src.persistence.memory_retriever import get_context
    from src.persistence.memory_store import append_episode

    task = state.get("task", "")

    # Inject memory context (Pattern 15)
    memory_ctx = await get_context(agent_id, task)

    # Emit STEP_STARTED custom event
    if writer:
        await _emit_writer_event(writer, {
            "type": "step_started",
            "agent_id": agent_id,
            "step_name": f"{agent_id} invocation",
        })

    start = time.time()
    try:
        sub_state = {
            "messages": [HumanMessage(content=task)],
            "memory_context": memory_ctx,
        }
        result = await agent.ainvoke(sub_state)
        output = _extract_output(result)

        # Append to episode log
        await append_episode(
            agent_id,
            "llm_call",
            output[:500],
            workflow_id=state.get("workflow_id", ""),
        )

        if writer:
            await _emit_writer_event(writer, {
                "type": "step_finished",
                "agent_id": agent_id,
                "duration_ms": int((time.time() - start) * 1000),
            })

        return {
            "agent_outputs": {agent_id: output},
            "current_agent": agent_id,
        }

    except Exception as exc:
        logger.error("Agent node %s failed: %s", agent_id, exc)
        if writer:
            await _emit_writer_event(writer, {"type": "agent_error", "agent_id": agent_id, "error": str(exc)})
        return {
            "agent_outputs": {agent_id: f"ERROR: {exc}"},
            "current_agent": agent_id,
            "error": str(exc),
        }


def _extract_output(result: Any) -> str:
    """Extract the final text output from an agent result."""
    if isinstance(result, dict):
        messages = result.get("messages", [])
        if messages:
            last = messages[-1]
            if hasattr(last, "content"):
                content = last.content
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            return block.get("text", "")
                return str(content)
        return str(result.get("output", result))
    return str(result)


# ── Concrete LangGraph nodes (imported by graph.py) ────────────────────────────

async def _get_agent(agent_name: str) -> Any:
    from src.agents.registry import build_agents
    agents = await build_agents()
    agent = agents.get(agent_name)
    if not agent:
        raise RuntimeError(f"Agent '{agent_name}' not available")
    return agent


async def research_node(state: OrchestratorState, writer: Any = None) -> dict[str, Any]:
    return await agent_node(state, await _get_agent("research"), "research", writer=writer)


async def code_node(state: OrchestratorState, writer: Any = None) -> dict[str, Any]:
    return await agent_node(state, await _get_agent("code"), "code", writer=writer)


async def data_node(state: OrchestratorState, writer: Any = None) -> dict[str, Any]:
    return await agent_node(state, await _get_agent("data"), "data", writer=writer)


async def writer_node(state: OrchestratorState, writer: Any = None) -> dict[str, Any]:
    return await agent_node(state, await _get_agent("writer"), "writer", writer=writer)


async def verifier_node(state: OrchestratorState, writer: Any = None) -> dict[str, Any]:
    return await agent_node(state, await _get_agent("verifier"), "verifier", writer=writer)
