"""
supervisor.py — Supervisor node (Pattern 3: explicit model routing).

Orchestration decisions: which specialist to call next, when to complete.
Uses get_chat_model() — works with any provider (Anthropic, OpenRouter, Ollama).
Extended thinking activates automatically when the supervisor model is claude-*.

Emits agent_handoff CUSTOM events for the frontend graph.
"""
from __future__ import annotations

import inspect
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END

from src.agents.model_router import ModelProvider, detect_provider
from src.config.settings import settings
from src.graph.state import OrchestratorState

logger = logging.getLogger(__name__)

# Tool schemas for structured routing output.
# These are passed via bind_tools — LangChain translates to the provider's format.
ROUTE_TOOL = {
    "name": "route_to_agent",
    "description": "Delegate the next task to the most appropriate specialist agent.",
    "parameters": {
        "type": "object",
        "properties": {
            "agent_name": {
                "type": "string",
                "enum": ["research", "code", "data", "writer"],
                "description": "Which specialist to invoke",
            },
            "task": {
                "type": "string",
                "description": "Precise task description for the specialist",
            },
            "reason": {
                "type": "string",
                "description": "Why this specialist is the right choice",
            },
        },
        "required": ["agent_name", "task", "reason"],
    },
}

COMPLETE_TOOL = {
    "name": "complete_workflow",
    "description": "Mark the workflow as complete once all objectives are met.",
    "parameters": {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "key_outputs": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary"],
    },
}


async def _emit_writer_event(writer: Any, payload: dict[str, Any]) -> None:
    result = writer(payload)
    if inspect.isawaitable(result):
        await result


# Hard ceiling on supervisor→specialist round-trips.
# Prevents runaway recursion when the LLM keeps routing without completing.
MAX_SUPERVISOR_ITERATIONS = 12


async def supervisor_node(
    state: OrchestratorState,
    writer: Any = None,
) -> dict[str, Any]:
    """
    Supervisor node: reads accumulated outputs and decides what happens next.

    Uses the supervisor model from the registry — defaults to claude-opus-4-6
    but can be changed to any OpenRouter or Ollama model by updating registry.py.

    Includes an iteration guard: after MAX_SUPERVISOR_ITERATIONS cycles the
    workflow is forcibly completed to avoid hitting the LangGraph recursion limit.
    """
    from src.agents.model_router import get_chat_model
    from src.agents.registry import get_agent_configs
    from src.config.prompts import get_prompt
    from src.persistence.memory_retriever import get_context

    # ── Iteration guard ───────────────────────────────────────────────────────
    iteration = state.get("iteration_count", 0) + 1
    if iteration > MAX_SUPERVISOR_ITERATIONS:
        logger.warning(
            "supervisor.max_iterations_reached count=%d — force-completing",
            iteration,
        )
        return {
            "next":            END,
            "is_complete":     True,
            "iteration_count": iteration,
            "agent_outputs":   {
                "supervisor": (
                    f"Workflow automatically completed after {iteration} supervisor "
                    f"cycles to prevent infinite recursion. Partial results from "
                    f"{len(state.get('agent_outputs', {}))} agents are available."
                ),
            },
        }

    # Get supervisor model from registry (respects any model ID format)
    supervisor_cfg = get_agent_configs().get("supervisor")
    model_id = supervisor_cfg.model if supervisor_cfg else settings.default_model

    llm = get_chat_model(
        model_id               = model_id,
        temperature            = 1.0,
        streaming              = True,
        # Extended thinking activates for claude-* only (model_router handles this)
        thinking_budget_tokens = 10000,
    )

    task         = state.get("task", "")
    agent_outputs = state.get("agent_outputs", {})
    memory_ctx   = await get_context("supervisor", task)

    outputs_summary = "\n".join(
        f"[{agent}]: {str(output)[:400]}"
        for agent, output in agent_outputs.items()
    ) or "No agent outputs yet."

    system_prompt = get_prompt(
        "supervisor",
        task=task,
        memory_context=memory_ctx,
        agent_outputs=outputs_summary,
    )

    # Build messages
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content="Assess the current state and decide what to do next."),
    ]

    # Bind routing tools — LangChain translates to provider-native tool format
    # tool_choice differs by provider: Anthropic uses "any", OpenAI/OpenRouter uses "required"
    provider = detect_provider(model_id)
    tc = "any" if provider == ModelProvider.ANTHROPIC else "required"
    llm_with_tools = llm.bind_tools([ROUTE_TOOL, COMPLETE_TOOL], tool_choice=tc)

    # Langfuse callback
    invoke_config: dict[str, Any] = {}
    if settings.langfuse_enabled:
        from src.observability.langfuse_handler import get_handler
        invoke_config["callbacks"] = [get_handler()]

    response = await llm_with_tools.ainvoke(messages, config=invoke_config)

    # Parse tool calls from response
    for tool_call in (response.tool_calls or []):
        name  = tool_call.get("name", "")
        args  = tool_call.get("args", {})

        if name == "route_to_agent":
            target = args.get("agent_name", "")
            task_for_agent = args.get("task", task)
            reason = args.get("reason", "")

            # Emit handoff event for frontend graph
            if writer:
                await _emit_writer_event(writer, {
                    "type":          "CUSTOM",
                    "customType":    "agent_handoff",
                    "payload": {
                        "fromAgentId": "supervisor",
                        "toAgentId":   target,
                        "task":        task_for_agent,
                        "reason":      reason,
                    },
                })

            logger.info("supervisor.routing to=%s reason=%s iteration=%d", target, reason[:60], iteration)
            return {
                "next": target,
                "current_agent": "supervisor",
                "iteration_count": iteration,
                "active_task": task_for_agent,
            }

        if name == "complete_workflow":
            # Guard: don't allow completion before any specialist has run
            if not agent_outputs:
                logger.warning(
                    "supervisor.premature_completion — no specialist outputs yet, "
                    "forcing route to research. iteration=%d", iteration,
                )
                return {"next": "research", "current_agent": "supervisor", "iteration_count": iteration}

            summary = args.get("summary", "")
            logger.info("supervisor.completing summary=%s iteration=%d", summary[:80], iteration)
            return {
                "next":           END,
                "is_complete":    True,
                "iteration_count": iteration,
                "agent_outputs":  {"supervisor": summary},
            }

    # No tool call produced — end gracefully
    logger.warning("supervisor.no_tool_call — ending workflow iteration=%d", iteration)
    return {"next": END, "is_complete": True, "iteration_count": iteration}
