"""
test_graph/test_state.py — Unit tests for OrchestratorState and edge functions.

Tests:
  - State TypedDict initialises correctly
  - merge_outputs reducer combines dicts (last write wins)
  - merge_mailboxes reducer appends without losing messages
  - route_to_agent returns correct target names
  - should_verify respects needs_verification flag and heuristic threshold
"""

from __future__ import annotations

import pytest
from langgraph.graph import END

from src.graph.edges import route_to_agent, should_verify
from src.graph.state import merge_mailboxes, merge_outputs

# ── State reducers ────────────────────────────────────────────────────────────

def test_merge_outputs_last_write_wins():
    existing = {"research": "result A", "code": "result B"}
    update   = {"research": "result A updated", "writer": "result C"}
    merged   = merge_outputs(existing, update)
    assert merged["research"] == "result A updated"  # overwritten
    assert merged["code"]     == "result B"           # preserved
    assert merged["writer"]   == "result C"           # new key


def test_merge_mailboxes_appends():
    existing = {"research": [{"content": "task 1"}]}
    update   = {"research": [{"content": "task 2"}], "code": [{"content": "task 3"}]}
    merged   = merge_mailboxes(existing, update)
    assert len(merged["research"]) == 2
    assert merged["research"][1]["content"] == "task 2"
    assert len(merged["code"]) == 1


def test_merge_mailboxes_empty_existing():
    merged = merge_mailboxes({}, {"research": [{"content": "first"}]})
    assert merged["research"][0]["content"] == "first"


# ── Edge routing ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("next_val,expected", [
    ("research",   "research"),
    ("code",       "code"),
    ("data",       "data"),
    ("writer",     "writer"),
    ("__end__",    END),
    ("END",        END),
    ("",           END),
    (None,         END),
])
def test_route_to_agent_targets(
    next_val, expected, sample_orchestrator_state
):
    state = {**sample_orchestrator_state, "next": next_val}
    assert route_to_agent(state) == expected


def test_should_verify_flag(sample_orchestrator_state):
    state = {**sample_orchestrator_state, "needs_verification": True}
    assert should_verify(state) == "supervisor"


def test_should_verify_long_output_heuristic(sample_orchestrator_state):
    """A very long output should trigger verification even without the flag."""
    long_output = "x" * 10_000  # well over threshold
    state = {
        **sample_orchestrator_state,
        "needs_verification": False,
        "current_agent": "research",
        "agent_outputs": {"research": long_output},
    }
    assert should_verify(state) == "supervisor"


def test_should_verify_short_output_skips(sample_orchestrator_state):
    state = {
        **sample_orchestrator_state,
        "needs_verification": False,
        "current_agent": "research",
        "agent_outputs": {"research": "Short output."},
    }
    assert should_verify(state) == "supervisor"
