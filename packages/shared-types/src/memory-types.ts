// ─────────────────────────────────────────────────────────────────────────────
// Memory Types
// Shapes for the three-layer memory system (hot cache, episode log, KG).
// ─────────────────────────────────────────────────────────────────────────────

import type { MemoryEntityType, MemoryRelationship } from "./graph-types.js";

// ── Tier 1: Hot Cache ─────────────────────────────────────────────────────────

export interface CoreMemory {
  agentId: string;
  facts: CoreFact[];
  updatedAt: number;
  version: number;
}

export interface CoreFact {
  id: string;
  content: string;
  confidence: number;
  source: "episode" | "graph" | "user";
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

// ── Tier 2: Episode Log ───────────────────────────────────────────────────────

export interface EpisodeEntry {
  id: string;
  agentId: string;
  workflowId: string;
  timestamp: number;
  entryType: EpisodeEntryType;
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  tokenCount?: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
}

export type EpisodeEntryType =
  | "llm_call"
  | "tool_call"
  | "tool_result"
  | "decision"
  | "handoff"
  | "error"
  | "memory_read"
  | "memory_write";

// ── Tier 3: Knowledge Graph ───────────────────────────────────────────────────

export interface KnowledgeGraphNode {
  id: string;
  entityType: MemoryEntityType;
  label: string;
  properties: Record<string, unknown>;
  agentId: string | null;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  isContradicted: boolean;
  contradictedBy: string | null;   // node id
}

export interface KnowledgeGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: MemoryRelationship;
  properties: Record<string, unknown>;
  confidence: number;
  timestamp: number;
  agentId: string | null;
}

// ── Memory Context (injected into agent prompts) ──────────────────────────────

export interface MemoryContext {
  agentId: string;
  taskQuery: string;
  hotCacheFacts: string;          // pre-formatted for prompt injection
  semanticResults: string;        // pre-formatted
  graphContext: string;           // pre-formatted
  proceduralMemory: string;       // pre-formatted
  totalTokens: number;
  retrievedAt: number;
}

// ── Consolidation ─────────────────────────────────────────────────────────────

export interface ConsolidationResult {
  agentId: string;
  ranAt: number;
  episodesProcessed: number;
  hotCacheUpdated: boolean;
  kgNodesAdded: number;
  kgEdgesAdded: number;
  conflictsDetected: number;
  proceduralPatternsUpdated: number;
  durationMs: number;
}
