"""
Supervisor node — Pattern 3 (explicit model routing), orchestration decisions.

Uses Claude Opus to decide which specialist to call next and when to complete.
Emits agent_handoff custom events for the frontend graph.
"""
from __future__ import annotations
import json
import logging
from typing import Any
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import END
from src.config.prompts import get_prompt
from src.config.settings import settings
from src.graph.state import OrchestratorState
from src.observability.langfuse_handler import get_handler
from src.persistence.memory_retriever import get_context

logger = logging.getLogger(__name__)

ROUTE_TOOL_SCHEMA = {
    "name": "route_to_agent",
    "description": "Route the current task to the most appropriate specialist agent.",
    "input_schema": {
        "type": "object",
        "properties": {
            "agent_name": {
                "type": "string",
                "enum": ["research", "code", "data", "writer"],
                "description": "Which specialist to call",
            },
            "task": {
                "type": "string",
                "description": "Specific task for the specialist (be precise)",
            },
            "reason": {
                "type": "string",
                "description": "Why this specialist is the right choice",
            },
        },
        "required": ["agent_name", "task", "reason"],
    },
}

COMPLETE_TOOL_SCHEMA = {
    "name": "complete_workflow",
    "description": "Mark the workflow as complete and provide the final summary.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "key_outputs": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary"],
    },
}


async def supervisor_node(
    state: OrchestratorState,
    writer: Any = None,
) -> dict[str, Any]:
    """Supervisor: decide next agent or complete workflow."""
    from anthropic import AsyncAnthropic

    task = state.get("task", "")
    agent_outputs = state.get("agent_outputs", {})
    memory_ctx = await get_context("supervisor", task)

    outputs_summary = "\n".join(
        f"[{agent}]: {str(output)[:400]}"
        for agent, output in agent_outputs.items()
    ) or "No outputs yet."

    prompt = get_prompt(
        "supervisor",
        task=task,
        memory_context=memory_ctx,
        agent_outputs=outputs_summary,
    )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1000,
        system=prompt,
        tools=[ROUTE_TOOL_SCHEMA, COMPLETE_TOOL_SCHEMA],
        messages=[{"role": "user", "content": "What should we do next?"}],
    )

    for block in response.content:
        if block.type == "tool_use":
            if block.name == "route_to_agent":
                target = block.input.get("agent_name", "")
                if writer:
                    await writer({
                        "type": "agent_handoff",
                        "from_agent_id": "supervisor",
                        "to_agent_id": f"{target}_agent",
                        "task": block.input.get("task", task),
                        "reason": block.input.get("reason", ""),
                    })
                return {"next": target, "current_agent": "supervisor"}

            if block.name == "complete_workflow":
                return {
                    "next": END,
                    "is_complete": True,
                    "agent_outputs": {"supervisor": block.input.get("summary", "")},
                }

    # No tool use — default to END
    return {"next": END, "is_complete": True}
