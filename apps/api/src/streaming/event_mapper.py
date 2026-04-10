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
_KNOWN_AGENT_IDS = ("research", "code", "data", "writer", "supervisor", "verifier", "orchestrator")

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
        # Track most recent STEP_STARTED per agent for custom step events
        self._agent_step_ids: dict[str, str] = {}
        # Track which agents have had RUN_STARTED emitted
        self._started_agents: set[str] = set()
        # Track which nodeIds have had TEXT_MESSAGE_START emitted
        # (A single messageId may produce both thinking and response streams.)
        self._started_message_nodes: set[str] = set()
        # Track cumulative streamed lengths per node for TEXT_MESSAGE_END.totalLength
        self._node_text_len: dict[str, int] = {}

    def map(self, stream_part: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Convert a single LangGraph StreamPart into 0-N AG-UI events.
        Returns a list (most events produce 1, some produce 0 or 2).
        """
        part_type = stream_part.get("event", stream_part.get("type", ""))
        data = self._as_dict(stream_part.get("data", stream_part))
        ts = int(time.time() * 1000)

        events: list[dict[str, Any]] = []

        # ── Text / thinking token streaming ───────────────────────────────────
        if part_type == "on_chat_model_stream":
            chunk = data.get("chunk", {})
            content = self._extract_chunk_content(chunk)
            agent_id = self._get_agent_id(data)

            # Ensure RUN_STARTED has been emitted for this agent
            events.extend(self._maybe_emit_run_started(agent_id, ts))

            if isinstance(content, list):
                # Anthropic returns content blocks — thinking blocks only appear
                # for claude-* models. Other providers (OpenRouter, Ollama) emit
                # plain text strings, handled by the elif branch below.
                for block in content:
                    b = self._as_dict(block)
                    if b.get("type") == "thinking":
                        delta = str(b.get("thinking", "") or "")
                        if delta:
                            events.extend(self._maybe_emit_text_start(data, ts, is_thinking=True))
                            events.append(self._thinking_delta_event(data, delta, ts))
                    elif b.get("type") == "text":
                        delta = str(b.get("text", "") or "")
                        if delta:
                            events.extend(self._maybe_emit_text_start(data, ts, is_thinking=False))
                            events.append(self._text_content_event(data, delta, ts))
            elif isinstance(content, str) and content:
                events.extend(self._maybe_emit_text_start(data, ts, is_thinking=False))
                events.append(self._text_content_event(data, content, ts))

            # If we only emitted RUN_STARTED and no stream content events, drop it.
            if len(events) == 1 and events[0].get("type") == "RUN_STARTED":
                return []

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

        # ── Chat model stream end — emit TEXT_MESSAGE_END ──────────────────────
        elif part_type == "on_chat_model_end":
            run_id = data.get("run_id", "")
            msg_id = self._message_ids.get(run_id)
            if msg_id:
                for node_id in (f"thinking-{msg_id}", f"text-{msg_id}"):
                    if node_id in self._started_message_nodes:
                        events.append({
                            "type": "TEXT_MESSAGE_END",
                            "runId": self.workflow_id,
                            "timestamp": ts,
                            "messageId": msg_id,
                            "nodeId": node_id,
                            "totalLength": int(self._node_text_len.get(node_id, 0)),
                        })

        # ── Chain/agent step start ────────────────────────────────────────────
        elif part_type in ("on_chain_start", "on_agent_action"):
            run_id = data.get("run_id", "")
            step_id = f"step-{str(uuid.uuid4())[:8]}"
            if run_id:
                self._run_to_node[run_id] = step_id
            agent_id = self._get_agent_id(data)

            # Ensure RUN_STARTED has been emitted for this agent
            events.extend(self._maybe_emit_run_started(agent_id, ts))

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
            agent_id = self._get_agent_id(data)
            events.append({
                "type": "STEP_FINISHED",
                "runId": self.workflow_id,
                "timestamp": ts,
                "stepId": step_id,
                "agentId": agent_id,
                "durationMs": 0,
                "tokenCount": None,
            })

            # Emit RUN_FINISHED for on_agent_finish (top-level agent completion)
            if part_type == "on_agent_finish" and agent_id in self._started_agents:
                events.append({
                    "type": "RUN_FINISHED",
                    "runId": self.workflow_id,
                    "timestamp": ts,
                    "agentId": agent_id,
                    "output": None,
                    "totalTokens": 0,
                    "durationMs": 0,
                })

        # ── Custom writer events (pass-through) ───────────────────────────────
        elif part_type == "custom" or "customType" in data:
            # Two possibilities:
            # 1) Already in AG-UI format (type like "CUSTOM", "RUN_STARTED", etc.)
            # 2) Internal node writer events (legacy snake_case types) — normalize.
            t = data.get("type")

            if t in ("step_started", "step_finished", "agent_error"):
                agent_id = data.get("agent_id", "unknown")
                events.extend(self._maybe_emit_run_started(agent_id, ts))

                if t == "step_started":
                    step_id = f"step-{str(uuid.uuid4())[:8]}"
                    self._agent_step_ids[agent_id] = step_id
                    events.append({
                        "type": "STEP_STARTED",
                        "runId": self.workflow_id,
                        "timestamp": ts,
                        "stepId": step_id,
                        "agentId": agent_id,
                        "stepType": "llm_call",
                        "stepName": data.get("step_name", "agent invocation"),
                    })
                elif t == "step_finished":
                    step_id = self._agent_step_ids.get(agent_id, f"step-{str(uuid.uuid4())[:8]}")
                    duration_ms = data.get("duration_ms", 0)
                    try:
                        duration_ms = int(duration_ms)
                    except Exception:
                        duration_ms = 0
                    events.append({
                        "type": "STEP_FINISHED",
                        "runId": self.workflow_id,
                        "timestamp": ts,
                        "stepId": step_id,
                        "agentId": agent_id,
                        "durationMs": duration_ms,
                        "tokenCount": None,
                    })
                else:  # agent_error
                    events.append({
                        "type": "RUN_ERROR",
                        "runId": self.workflow_id,
                        "timestamp": ts,
                        "agentId": agent_id,
                        "error": data.get("error", "unknown error"),
                        "code": None,
                    })
            else:
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
        self._node_text_len[node_id] = self._node_text_len.get(node_id, 0) + len(delta)
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
        self._node_text_len[node_id] = self._node_text_len.get(node_id, 0) + len(delta)
        return {
            "type": "TEXT_MESSAGE_CONTENT",
            "runId": self.workflow_id,
            "timestamp": ts,
            "messageId": msg_id,
            "nodeId": node_id,
            "delta": delta,
            "isThinking": False,
        }

    def _maybe_emit_run_started(self, agent_id: str, ts: int) -> list[dict[str, Any]]:
        """Emit a RUN_STARTED event the first time we see activity from an agent."""
        if not agent_id or agent_id == "unknown" or agent_id in self._started_agents:
            return []
        self._started_agents.add(agent_id)

        from src.agents.registry import get_agent_configs

        cfg = get_agent_configs().get(agent_id)
        agent_name = cfg.name if cfg else agent_id.replace("_", " ").title()
        role = (cfg.role if cfg else "research").lower()
        model = cfg.model if cfg else "unknown"
        tools: list[str] = []
        if cfg and cfg.tools:
            tools = [getattr(t, "name", str(t)) for t in cfg.tools]

        return [{
            "type": "RUN_STARTED",
            "runId": self.workflow_id,
            "timestamp": ts,
            "agentId": agent_id,
            "agentName": agent_name,
            "workflowId": self.workflow_id,
            "input": "",
            "role": role,
            "model": model,
            "tools": tools,
        }]

    def _maybe_emit_text_start(self, data: dict[str, Any], ts: int, *, is_thinking: bool) -> list[dict[str, Any]]:
        """Emit TEXT_MESSAGE_START the first time we see content for a message."""
        run_id = data.get("run_id", "")
        msg_id = self._message_ids.get(run_id)
        if not msg_id:
            msg_id = f"msg-{str(uuid.uuid4())[:8]}"
            self._message_ids[run_id] = msg_id
        node_id = f"thinking-{msg_id}" if is_thinking else f"text-{msg_id}"
        if node_id in self._started_message_nodes:
            return []
        self._started_message_nodes.add(node_id)
        agent_id = self._get_agent_id(data)
        return [{
            "type": "TEXT_MESSAGE_START",
            "runId": self.workflow_id,
            "timestamp": ts,
            "messageId": msg_id,
            "nodeId": node_id,
            "agentId": agent_id,
            "stepId": self._run_to_node.get(run_id, agent_id),
            "isThinking": is_thinking,
        }]

    def _get_agent_id(self, data: dict[str, Any]) -> str:
        # Try to extract the agent name from LangGraph metadata with robust fallbacks.
        metadata = self._as_dict(data.get("metadata", {}))

        raw_tags = data.get("tags", [])
        if isinstance(raw_tags, str):
            tags = [raw_tags]
        elif isinstance(raw_tags, (list, tuple, set)):
            tags = [str(t) for t in raw_tags if t is not None]
        else:
            tags = []

        for tag in tags:
            t = tag.strip().lower()
            if t in _KNOWN_AGENT_IDS:
                return "supervisor" if t == "orchestrator" else t

        candidates = [
            data.get("agent_id"),
            data.get("agent"),
            data.get("name"),
            data.get("run_name"),
            metadata.get("langgraph_node"),
            metadata.get("agent_id"),
            metadata.get("name"),
            metadata.get("node_name"),
        ]
        for candidate in candidates:
            if not candidate:
                continue
            c = str(candidate).strip().lower().replace("-", "_").replace(" ", "_")
            for known in _KNOWN_AGENT_IDS:
                if c == known or c.startswith(f"{known}_") or c.endswith(f"_{known}") or f"_{known}_" in c:
                    return "supervisor" if known == "orchestrator" else known

        return "unknown"

    def _as_dict(self, value: Any) -> dict[str, Any]:
        """Best-effort normalize LangGraph payload/chunk objects to dict."""
        if isinstance(value, dict):
            return value
        if value is None:
            return {}
        # Pydantic v2
        if hasattr(value, "model_dump"):
            try:
                dumped = value.model_dump()  # type: ignore[attr-defined]
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass
        # Pydantic v1
        if hasattr(value, "dict"):
            try:
                dumped = value.dict()  # type: ignore[attr-defined]
                if isinstance(dumped, dict):
                    return dumped
            except Exception:
                pass
        # Dataclass / generic python object
        if hasattr(value, "__dict__"):
            try:
                obj = dict(vars(value))
                if isinstance(obj, dict):
                    return obj
            except Exception:
                pass
        return {}

    def _extract_chunk_content(self, chunk: Any) -> Any:
        """
        Support dict and object chunks (e.g., AIMessageChunk) from LangGraph streams.
        Returns either list[blocks], plain text, or "".
        """
        chunk_dict = self._as_dict(chunk)
        if "content" in chunk_dict:
            return chunk_dict.get("content", "")
        if hasattr(chunk, "content"):
            try:
                return chunk.content
            except Exception:
                return ""
        return ""
