"""
event_mapper.py — LangGraph StreamPart → AG-UI event bridge.

This is the single most architecturally important file in the backend.
It transforms LangGraph's internal stream events into the AG-UI protocol
events that the frontend understands.

LangGraph stream_mode=["updates", "messages", "custom"] yields dicts
with a "type" key. We map each type to the correct AG-UI EventType.

The frontend never imports from LangGraph — only from this mapper.
If the orchestration engine changes, only this file needs updating.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Map LangGraph callback event names → AG-UI step types
_STEP_TYPE_MAP = {
    "on_chain_start":  "llm_call",
    "on_agent_action": "llm_call",
    "on_tool_start":   "tool_use",
    "on_retriever_run": "llm_call",
}


class StreamPartMapper:
    """
    Stateful mapper — tracks run_id → node_id mappings across a stream session.
    One instance per active workflow stream.
    """

    def __init__(self, workflow_id: str) -> None:
        self.workflow_id = workflow_id
        self._run_to_node: dict[str, str] = {}
        self._tool_call_ids: dict[str, str] = {}
        self._message_ids: dict[str, str] = {}

    def map(self, stream_part: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Convert a single LangGraph StreamPart into 0-N AG-UI events.
        Returns a list (most events produce 1, some produce 0 or 2).
        """
        part_type = stream_part.get("event", stream_part.get("type", ""))
        data = stream_part.get("data", stream_part)
        ts = int(time.time() * 1000)

        events: list[dict[str, Any]] = []

        # ── Text / thinking token streaming ───────────────────────────────────
        if part_type == "on_chat_model_stream":
            chunk = data.get("chunk", {})
            content = chunk.get("content", "")

            if isinstance(content, list):
                # Anthropic returns content blocks — thinking blocks only appear
                # for claude-* models. Other providers (OpenRouter, Ollama) emit
                # plain text strings, handled by the elif branch below.
                for block in content:
                    if block.get("type") == "thinking":
                        delta = block.get("thinking", "")
                        if delta:
                            events.append(self._thinking_delta_event(data, delta, ts))
                    elif block.get("type") == "text":
                        delta = block.get("text", "")
                        if delta:
                            events.append(self._text_content_event(data, delta, ts))
            elif isinstance(content, str) and content:
                events.append(self._text_content_event(data, content, ts))

        # ── Tool call start ───────────────────────────────────────────────────
        elif part_type == "on_tool_start":
            tool_call_id = str(uuid.uuid4())[:12]
            run_id = data.get("run_id", "")
            if run_id:
                self._tool_call_ids[run_id] = tool_call_id
            node_id = f"tool-{tool_call_id}"
            self._run_to_node[run_id] = node_id

            events.append({
                "type": "TOOL_CALL_START",
                "runId": self.workflow_id,
                "timestamp": ts,
                "toolCallId": tool_call_id,
                "nodeId": node_id,
                "agentId": self._get_agent_id(data),
                "toolName": data.get("name", "unknown_tool"),
            })

        # ── Tool call end ─────────────────────────────────────────────────────
        elif part_type == "on_tool_end":
            run_id = data.get("run_id", "")
            tool_call_id = self._tool_call_ids.get(run_id, str(uuid.uuid4())[:12])
            node_id = self._run_to_node.get(run_id, f"tool-{tool_call_id}")
            output = data.get("output", "")
            result_str = str(output)[:2000] if output else ""

            events.append({
                "type": "TOOL_CALL_END",
                "runId": self.workflow_id,
                "timestamp": ts,
                "toolCallId": tool_call_id,
                "nodeId": node_id,
                "result": result_str,
                "status": "success",
                "durationMs": 0,
            })

        # ── Chain/agent step start ────────────────────────────────────────────
        elif part_type in ("on_chain_start", "on_agent_action"):
            run_id = data.get("run_id", "")
            step_id = f"step-{str(uuid.uuid4())[:8]}"
            if run_id:
                self._run_to_node[run_id] = step_id
            agent_id = self._get_agent_id(data)

            events.append({
                "type": "STEP_STARTED",
                "runId": self.workflow_id,
                "timestamp": ts,
                "stepId": step_id,
                "agentId": agent_id,
                "stepType": _STEP_TYPE_MAP.get(part_type, "llm_call"),
                "stepName": data.get("name", part_type),
            })

        # ── Chain/agent step end ──────────────────────────────────────────────
        elif part_type in ("on_chain_end", "on_agent_finish"):
            run_id = data.get("run_id", "")
            step_id = self._run_to_node.get(run_id, f"step-{str(uuid.uuid4())[:8]}")
            events.append({
                "type": "STEP_FINISHED",
                "runId": self.workflow_id,
                "timestamp": ts,
                "stepId": step_id,
                "agentId": self._get_agent_id(data),
                "durationMs": 0,
                "tokenCount": None,
            })

        # ── Custom writer events (pass-through) ───────────────────────────────
        elif part_type == "custom" or "customType" in data:
            # Already in AG-UI format — pass through with runId + timestamp
            events.append({
                **data,
                "runId": self.workflow_id,
                "timestamp": ts,
            })

        # ── Graph state updates ───────────────────────────────────────────────
        elif part_type == "updates":
            # Emit a STATE_DELTA for each node update
            for node_name, update in data.items():
                if node_name and update:
                    events.append({
                        "type": "STATE_DELTA",
                        "runId": self.workflow_id,
                        "timestamp": ts,
                        "delta": [
                            {"op": "replace", "path": f"/{node_name}", "value": str(update)[:500]}
                        ],
                    })

        return events

    def _thinking_delta_event(self, data: dict[str, Any], delta: str, ts: int) -> dict[str, Any]:
        run_id = data.get("run_id", "")
        msg_id = self._message_ids.setdefault(run_id, f"msg-{str(uuid.uuid4())[:8]}")
        node_id = f"thinking-{msg_id}"
        return {
            "type": "CUSTOM",
            "customType": "thinking_delta",
            "runId": self.workflow_id,
            "timestamp": ts,
            "payload": {
                "nodeId": node_id,
                "agentId": self._get_agent_id(data),
                "delta": delta,
                "messageId": msg_id,
            },
        }

    def _text_content_event(self, data: dict[str, Any], delta: str, ts: int) -> dict[str, Any]:
        run_id = data.get("run_id", "")
        msg_id = self._message_ids.setdefault(run_id, f"msg-{str(uuid.uuid4())[:8]}")
        node_id = f"text-{msg_id}"
        return {
            "type": "TEXT_MESSAGE_CONTENT",
            "runId": self.workflow_id,
            "timestamp": ts,
            "messageId": msg_id,
            "nodeId": node_id,
            "delta": delta,
            "isThinking": False,
        }

    def _get_agent_id(self, data: dict[str, Any]) -> str:
        # Try to extract the agent name from LangGraph metadata
        metadata = data.get("metadata", {})
        tags = data.get("tags", [])
        for tag in tags:
            if tag in ("research", "code", "data", "writer", "supervisor", "verifier"):
                return tag
        return metadata.get("langgraph_node", "unknown")
