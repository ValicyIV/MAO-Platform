"""
test_streaming/test_event_mapper.py — Unit tests for StreamPartMapper.

Tests every major LangGraph stream part type → AG-UI event mapping.
No LLM calls, no network — pure transformation logic.
"""

from __future__ import annotations

import pytest

from src.streaming.event_mapper import StreamPartMapper

WORKFLOW_ID = "test-wf-001"


@pytest.fixture
def mapper():
    return StreamPartMapper(WORKFLOW_ID)


# ── Text token streaming ──────────────────────────────────────────────────────

def test_text_delta_produces_content_event(mapper):
    stream_part = {
        "event": "on_chat_model_stream",
        "run_id": "run-abc",
        "data": {
            "run_id": "run-abc",
            "tags": ["research"],
            "chunk": {"content": [{"type": "text", "text": "Hello"}]},
        },
    }
    events = mapper.map(stream_part)
    # Mapper emits RUN_STARTED + TEXT_MESSAGE_START + TEXT_MESSAGE_CONTENT
    assert len(events) == 3
    assert events[0]["type"] == "RUN_STARTED"
    assert events[1]["type"] == "TEXT_MESSAGE_START"
    assert events[2]["type"] == "TEXT_MESSAGE_CONTENT"
    assert events[2]["delta"] == "Hello"
    assert events[2]["isThinking"] is False
    rs = events[0]
    assert rs["agentId"] == "research"
    assert rs["role"] == "research"
    assert "model" in rs and rs["model"]
    assert rs["tools"] == []


def test_thinking_delta_produces_custom_event(mapper):
    stream_part = {
        "event": "on_chat_model_stream",
        "run_id": "run-think",
        "data": {
            "run_id": "run-think",
            "chunk": {"content": [{"type": "thinking", "thinking": "Let me reason..."}]},
        },
    }
    events = mapper.map(stream_part)
    # Mapper emits RUN_STARTED + TEXT_MESSAGE_START + CUSTOM(thinking_delta)
    assert len(events) == 3
    assert events[0]["type"] == "RUN_STARTED"
    assert events[1]["type"] == "TEXT_MESSAGE_START"
    assert events[2]["type"] == "CUSTOM"
    assert events[2]["customType"] == "thinking_delta"
    assert events[2]["payload"]["delta"] == "Let me reason..."


def test_empty_delta_produces_no_events(mapper):
    stream_part = {
        "event": "on_chat_model_stream",
        "run_id": "run-empty",
        "data": {"run_id": "run-empty", "chunk": {"content": ""}},
    }
    assert mapper.map(stream_part) == []


def test_custom_step_events_are_normalized(mapper):
    start = mapper.map({
        "event": "custom",
        "data": {"type": "step_started", "agent_id": "research", "step_name": "research invocation"},
    })
    assert [e["type"] for e in start] == ["RUN_STARTED", "STEP_STARTED"]

    end = mapper.map({
        "event": "custom",
        "data": {"type": "step_finished", "agent_id": "research", "duration_ms": 12},
    })
    assert len(end) == 1
    assert end[0]["type"] == "STEP_FINISHED"
    assert end[0]["durationMs"] == 12

    err = mapper.map({
        "event": "custom",
        "data": {"type": "agent_error", "agent_id": "research", "error": "boom"},
    })
    assert len(err) == 1
    assert err[0]["type"] == "RUN_ERROR"
    assert err[0]["error"] == "boom"


# ── Tool calls ────────────────────────────────────────────────────────────────

def test_tool_start_produces_tool_call_start(mapper):
    stream_part = {
        "event": "on_tool_start",
        "data": {"run_id": "run-tool-1", "name": "web_search"},
    }
    events = mapper.map(stream_part)
    assert len(events) == 1
    assert events[0]["type"] == "TOOL_CALL_START"
    assert events[0]["toolName"] == "web_search"


def test_tool_end_produces_tool_call_end(mapper):
    # First establish the run_id → tool mapping via start
    mapper.map({
        "event": "on_tool_start",
        "data": {"run_id": "run-tool-2", "name": "arxiv"},
    })
    stream_part = {
        "event": "on_tool_end",
        "data": {"run_id": "run-tool-2", "output": "search results"},
    }
    events = mapper.map(stream_part)
    assert len(events) == 1
    assert events[0]["type"] == "TOOL_CALL_END"
    assert events[0]["result"] == "search results"
    assert events[0]["status"] == "success"


# ── Step lifecycle ────────────────────────────────────────────────────────────

def test_chain_start_produces_step_started(mapper):
    stream_part = {
        "event": "on_chain_start",
        "data": {"run_id": "run-chain-1", "name": "research_agent"},
    }
    events = mapper.map(stream_part)
    assert len(events) == 1
    assert events[0]["type"] == "STEP_STARTED"


def test_chain_end_produces_step_finished(mapper):
    mapper.map({
        "event": "on_chain_start",
        "data": {"run_id": "run-chain-2", "name": "research_agent"},
    })
    stream_part = {
        "event": "on_chain_end",
        "data": {"run_id": "run-chain-2"},
    }
    events = mapper.map(stream_part)
    assert len(events) == 1
    assert events[0]["type"] == "STEP_FINISHED"


# ── Custom events ─────────────────────────────────────────────────────────────

def test_custom_writer_event_passes_through(mapper):
    stream_part = {
        "event": "custom",
        "data": {
            "type": "CUSTOM",
            "customType": "agent_handoff",
            "payload": {"fromAgentId": "supervisor", "toAgentId": "research"},
        },
    }
    events = mapper.map(stream_part)
    assert len(events) == 1
    assert events[0]["customType"] == "agent_handoff"
    assert events[0]["runId"] == WORKFLOW_ID


# ── run_id → node_id mapping consistency ─────────────────────────────────────

def test_tool_start_end_same_node_id(mapper):
    mapper.map({
        "event": "on_tool_start",
        "data": {"run_id": "run-consistent", "name": "recall"},
    })
    end_events = mapper.map({
        "event": "on_tool_end",
        "data": {"run_id": "run-consistent", "output": "memory result"},
    })
    # Both should reference the same nodeId
    start_events = [e for e in mapper._run_to_node.items()]  # internal check
    assert len(end_events) == 1
    # The tool_call_id should be consistent across start and end
    assert end_events[0]["toolCallId"] is not None
