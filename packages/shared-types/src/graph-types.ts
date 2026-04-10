// ─────────────────────────────────────────────────────────────────────────────
// Graph Types
// React Flow node and edge data types for all 4 workflow levels + memory graph.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentRole, AgentStatus, ModelTier } from "./agent-types.js";

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum NodeLevel {
  Orchestrator = 1,
  Specialist = 2,
  ExecutionStep = 3,
  ThinkingStream = 4,
}

export enum NodeType {
  Orchestrator = "orchestrator",
  Specialist = "specialist",
  ExecutionStep = "executionStep",
  ToolCall = "toolCall",
  ThinkingStream = "thinkingStream",
  GroupContainer = "groupContainer",
  // Memory graph
  MemoryEntity = "memoryEntity",
}

export enum EdgeType {
  AgentFlow = "agentFlow",
  ToolCall = "toolCall",
  Handoff = "handoff",
  MemoryRelationship = "memoryRelationship",
}

export enum StepType {
  LLMCall = "llm_call",
  ToolUse = "tool_use",
  Decision = "decision",
  Handoff = "handoff",
  Verification = "verification",
}

export enum MemoryEntityType {
  Agent = "agent",
  Task = "task",
  Fact = "fact",
  Decision = "decision",
  Output = "output",
  Concept = "concept",
  Person = "person",
  Procedure = "procedure",
}

// ── Level 1: Orchestrator ─────────────────────────────────────────────────────

export interface OrchestratorNodeData extends Record<string, unknown> {
  level: NodeLevel.Orchestrator;
  workflowId: string;
  workflowName: string;
  status: AgentStatus;
  agentCount: number;
  totalTokens: number;
  expanded: boolean;
  startedAt: number | null;
}

// ── Level 2: Specialist Agent ─────────────────────────────────────────────────

export interface SpecialistNodeData extends Record<string, unknown> {
  level: NodeLevel.Specialist;
  agentId: string;
  agentName: string;
  emoji?: string;
  role: AgentRole;
  model: ModelTier;
  tools: string[];
  status: AgentStatus;
  tokenCount: number;
  expanded: boolean;
  currentStep: string | null;
}

// ── Level 3: Execution Step ───────────────────────────────────────────────────

export interface ExecutionStepNodeData extends Record<string, unknown> {
  level: NodeLevel.ExecutionStep;
  stepId: string;
  agentId: string;
  stepType: StepType;
  stepName: string;
  inputPreview: string | null;
  outputPreview: string | null;
  durationMs: number | null;
  tokenCount: number | null;
  expanded: boolean;
  hasThinking: boolean;
}

export interface ToolCallNodeData extends Record<string, unknown> {
  level: NodeLevel.ExecutionStep;
  stepId: string;
  agentId: string;
  stepType: StepType.ToolUse;
  toolName: string;
  toolArgs: Record<string, unknown>;
  toolResult: string | null;
  status: "pending" | "running" | "success" | "error";
  durationMs: number | null;
  expanded: boolean;
  hasThinking: false;
}

// ── Level 4: Thinking Stream ──────────────────────────────────────────────────

export interface ThinkingStreamNodeData extends Record<string, unknown> {
  level: NodeLevel.ThinkingStream;
  stepId: string;
  agentId: string;
  isStreaming: boolean;
  // Text content is NOT stored here — lives in streamingStore to isolate updates
  textLength: number;       // used to trigger Pretext re-measurement
  nodeWidth: number;
}

// ── Memory Graph Nodes ────────────────────────────────────────────────────────

export interface MemoryNodeData extends Record<string, unknown> {
  entityId: string;
  entityType: MemoryEntityType;
  label: string;
  summary: string | null;
  confidence: number;          // 0–1
  agentId: string | null;      // which agent contributed this (null = multi-agent)
  createdAt: number;           // unix ms
  updatedAt: number;
  isContradicted: boolean;
}

export interface MemoryEdgeData extends Record<string, unknown> {
  relationship: MemoryRelationship;
  confidence: number;
  timestamp: number;
  resolvedBy: string | null;   // entityId of resolution decision
}

export type MemoryRelationship =
  | "contributed_to"
  | "produced"
  | "knows_about"
  | "depends_on"
  | "derived_from"
  | "contradicts"
  | "resolved_by"
  | "worked_on"
  | "learned";

// ── Discriminated Union ───────────────────────────────────────────────────────

export type NodeDataUnion =
  | OrchestratorNodeData
  | SpecialistNodeData
  | ExecutionStepNodeData
  | ToolCallNodeData
  | ThinkingStreamNodeData
  | MemoryNodeData;

// ── Graph dump (API response shape for Memory Graph) ─────────────────────────

export interface MemoryGraphDump {
  entities: Array<{
    id: string;
    data: MemoryNodeData;
    position: { x: number; y: number };
  }>;
  relationships: Array<{
    id: string;
    source: string;
    target: string;
    data: MemoryEdgeData;
  }>;
  fetchedAt: number;
  agentFilter: string | null;
}

export interface MemoryDelta {
  added: MemoryNodeData[];
  updated: MemoryNodeData[];
  removed: string[];           // entityIds
  addedEdges: Array<{ source: string; target: string; data: MemoryEdgeData }>;
  conflicts: Array<{ entityA: string; entityB: string; resolvedBy: string | null }>;
  timestamp: number;
}
