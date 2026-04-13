"""
OrchestratorState — the central TypedDict for LangGraph state.

Every field is annotated with a reducer that determines how parallel
agent updates are merged. This is the single source of truth for all
data flowing through the graph.

Pattern 5 (OpenClaw Mailbox): the `mailbox` field implements agent-to-agent
  communication via in-state JSON messages, not external message brokers.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

# ── Mailbox helpers (Pattern 5: OpenClaw) ─────────────────────────────────────

AgentMessage = dict[str, Any]


def merge_mailboxes(
    existing: dict[str, list[AgentMessage]],
    new: dict[str, list[AgentMessage]],
) -> dict[str, list[AgentMessage]]:
    merged = dict(existing)
    for agent_id, messages in new.items():
        merged[agent_id] = merged.get(agent_id, []) + messages
    return merged


def merge_outputs(
    existing: dict[str, Any],
    new: dict[str, Any],
) -> dict[str, Any]:
    return {**existing, **new}


class OrchestratorState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    next: str
    current_agent: str
    task: str
    active_task: str
    workflow_id: str
    agent_outputs: Annotated[dict[str, Any], merge_outputs]
    mailbox: Annotated[dict[str, list[AgentMessage]], merge_mailboxes]
    metadata: dict[str, Any]
    verification_target: str | None
    is_complete: bool
    error: str | None
    iteration_count: int  # supervisor cycle counter — hard stop at MAX_ITERATIONS


class SubAgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    task: str
    agent_id: str
    memory_context: str
    tool_calls: list[dict[str, Any]]
    result: str | None
    error: str | None
