// ─────────────────────────────────────────────────────────────────────────────
// Agent Events
// AG-UI protocol event types + MAO custom extensions.
// All 17 AG-UI types are represented; custom MAO types use the CUSTOM wrapper.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentStatus } from "./agent-types.js";
import type { MemoryDelta, StepType, ToolCallNodeData } from "./graph-types.js";

// ── Core AG-UI event types ────────────────────────────────────────────────────

export type AGUIEventType =
  // Lifecycle
  | "RUN_STARTED"
  | "RUN_FINISHED"
  | "RUN_ERROR"
  // Steps
  | "STEP_STARTED"
  | "STEP_FINISHED"
  // Text streaming
  | "TEXT_MESSAGE_START"
  | "TEXT_MESSAGE_CONTENT"
  | "TEXT_MESSAGE_END"
  // Tool calls
  | "TOOL_CALL_START"
  | "TOOL_CALL_ARGS"
  | "TOOL_CALL_END"
  // State
  | "STATE_SNAPSHOT"
  | "STATE_DELTA"
  // Custom (MAO extensions)
  | "CUSTOM";

// ── Base event shape ──────────────────────────────────────────────────────────

export interface BaseEvent {
  type: AGUIEventType;
  runId: string;          // workflow_id
  timestamp: number;      // unix ms
}

// ── Lifecycle events ──────────────────────────────────────────────────────────

export interface RunStartedEvent extends BaseEvent {
  type: "RUN_STARTED";
  agentId: string;
  agentName: string;
  workflowId: string;
  input: string;
  /** Registry-backed fields (sent when API resolves agent_id via get_agent_configs). */
  role?: string;
  model?: string;
  tools?: string[];
}

export interface RunFinishedEvent extends BaseEvent {
  type: "RUN_FINISHED";
  agentId: string;
  output: string | null;
  totalTokens: number;
  durationMs: number;
}

export interface RunErrorEvent extends BaseEvent {
  type: "RUN_ERROR";
  agentId: string;
  error: string;
  code: string | null;
}

// ── Step events ───────────────────────────────────────────────────────────────

export interface StepStartedEvent extends BaseEvent {
  type: "STEP_STARTED";
  stepId: string;
  agentId: string;
  stepType: StepType;
  stepName: string;
}

export interface StepFinishedEvent extends BaseEvent {
  type: "STEP_FINISHED";
  stepId: string;
  agentId: string;
  durationMs: number;
  tokenCount: number | null;
}

// ── Text streaming events ─────────────────────────────────────────────────────

export interface TextMessageStartEvent extends BaseEvent {
  type: "TEXT_MESSAGE_START";
  messageId: string;
  nodeId: string;          // target ThinkingStreamNode id
  agentId: string;
  isThinking: boolean;     // true = extended thinking block
  stepId?: string;         // optional parent step node id (MAO extension)
}

export interface TextMessageContentEvent extends BaseEvent {
  type: "TEXT_MESSAGE_CONTENT";
  messageId: string;
  nodeId: string;
  delta: string;
  isThinking: boolean;
}

export interface TextMessageEndEvent extends BaseEvent {
  type: "TEXT_MESSAGE_END";
  messageId: string;
  nodeId: string;
  totalLength: number;
}

// ── Tool call events ──────────────────────────────────────────────────────────

export interface ToolCallStartEvent extends BaseEvent {
  type: "TOOL_CALL_START";
  toolCallId: string;
  nodeId: string;
  agentId: string;
  toolName: string;
}

export interface ToolCallArgsEvent extends BaseEvent {
  type: "TOOL_CALL_ARGS";
  toolCallId: string;
  delta: string;           // streamed JSON args
}

export interface ToolCallEndEvent extends BaseEvent {
  type: "TOOL_CALL_END";
  toolCallId: string;
  nodeId: string;
  result: string;
  status: ToolCallNodeData["status"];
  durationMs: number;
}

// ── State events ──────────────────────────────────────────────────────────────

export interface StateSnapshotEvent extends BaseEvent {
  type: "STATE_SNAPSHOT";
  snapshot: Record<string, unknown>;
}

export interface StateDeltaEvent extends BaseEvent {
  type: "STATE_DELTA";
  delta: Array<{            // JSON Patch (RFC 6902)
    op: "add" | "remove" | "replace" | "move" | "copy" | "test";
    path: string;
    value?: unknown;
    from?: string;
  }>;
}

// ── MAO Custom event payloads ─────────────────────────────────────────────────

export type MAOCustomEventType =
  | "thinking_delta"     // extended thinking token (maps to TEXT_MESSAGE_CONTENT)
  | "agent_handoff"      // supervisor delegating to specialist
  | "memory_update"      // knowledge graph delta from consolidation
  | "heartbeat"          // scheduler health pulse
  | "conflict_detected"  // memory contradiction found
  | "verification_start" // verification agent activated
  | "privacy_strip"      // private data was stripped before LLM

export interface CustomEvent extends BaseEvent {
  type: "CUSTOM";
  customType: MAOCustomEventType;
  payload: MAOEventPayloadMap[MAOCustomEventType];
}

export interface MAOEventPayloadMap {
  thinking_delta: {
    nodeId: string;
    agentId: string;
    delta: string;
    messageId: string;
  };
  agent_handoff: {
    fromAgentId: string;
    toAgentId: string;
    task: string;
    reason: string;
  };
  memory_update: {
    delta: MemoryDelta;
  };
  heartbeat: {
    timestamp: number;
    activeWorkflows: number;
    consolidationPending: boolean;
  };
  conflict_detected: {
    entityAId: string;
    entityBId: string;
    factA: string;
    factB: string;
    agentId: string;
  };
  verification_start: {
    agentId: string;
    targetStepId: string;
    reason: string;
  };
  privacy_strip: {
    agentId: string;
    tier: "sensitive" | "private";
    fieldsRemoved: number;
  };
}

// ── Discriminated union ───────────────────────────────────────────────────────

export type AgentEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent;

// Type guard helpers
export const isStreamingEvent = (e: AgentEvent): e is TextMessageContentEvent | CustomEvent =>
  e.type === "TEXT_MESSAGE_CONTENT" ||
  (e.type === "CUSTOM" && (e as CustomEvent).customType === "thinking_delta");

export const isCustomEvent = (e: AgentEvent, type: MAOCustomEventType): e is CustomEvent =>
  e.type === "CUSTOM" && (e as CustomEvent).customType === type;

export const isAgentStatusEvent = (e: AgentEvent): e is RunStartedEvent | RunFinishedEvent | RunErrorEvent =>
  e.type === "RUN_STARTED" || e.type === "RUN_FINISHED" || e.type === "RUN_ERROR";
