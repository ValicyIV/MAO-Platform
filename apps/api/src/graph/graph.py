"""
graph.py — Builds and compiles the LangGraph StateGraph.

This is the file referenced in langgraph.json as the graph entry point.
All agents are wired here via the supervisor routing pattern.
"""

from __future__ import annotations

import structlog
from langgraph.graph import END, StateGraph

from src.graph.state import OrchestratorState
from src.graph.edges import route_to_agent, should_verify, should_continue
from src.graph.nodes import (
    research_node, code_node, data_node, writer_node, verifier_node,
)
from src.graph.supervisor import supervisor_node
from src.persistence.checkpointer import get_checkpointer

log = structlog.get_logger(__name__)


def build_graph() -> StateGraph:
    """Construct the StateGraph — called once at module load."""

    workflow = StateGraph(OrchestratorState)

    # ── Nodes ─────────────────────────────────────────────────────────────────
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("research",   research_node)
    workflow.add_node("code",       code_node)
    workflow.add_node("data",       data_node)
    workflow.add_node("writer",     writer_node)
    workflow.add_node("verifier",   verifier_node)

    # ── Entry point ───────────────────────────────────────────────────────────
    workflow.set_entry_point("supervisor")

    # ── Routing from supervisor → specialists ─────────────────────────────────
    workflow.add_conditional_edges(
        "supervisor",
        route_to_agent,
        {
            "research": "research",
            "code":     "code",
            "data":     "data",
            "writer":   "writer",
            END:        END,
        },
    )

    # ── Specialists → verifier or back to supervisor (Pattern 4) ──────────────
    for agent_name in ("research", "code", "data", "writer"):
        workflow.add_conditional_edges(
            agent_name,
            should_verify,
            {
                "verifier":   "verifier",
                "supervisor": "supervisor",
            },
        )

    # ── Verifier → supervisor (always loops back for re-assessment) ────────────
    workflow.add_edge("verifier", "supervisor")

    log.info("graph.compiled")
    return workflow


# ── Compile with checkpointer ─────────────────────────────────────────────────
# `graph` is the symbol referenced by langgraph.json and main.py
graph = build_graph().compile(checkpointer=get_checkpointer())
