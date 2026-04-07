// ─────────────────────────────────────────────────────────────────────────────
// Agent Types
// Definitions for agent roles, status, configuration, and model routing.
// ─────────────────────────────────────────────────────────────────────────────

export enum AgentRole {
  Orchestrator = "orchestrator",
  Research = "research",
  Code = "code",
  Data = "data",
  Writer = "writer",
  Verifier = "verifier",
}

export enum AgentStatus {
  Idle = "idle",
  Running = "running",
  Thinking = "thinking",   // extended thinking active
  ToolCalling = "tool_calling",
  Waiting = "waiting",     // waiting for another agent
  Complete = "complete",
  Error = "error",
}

export enum ModelTier {
  Haiku = "claude-haiku-4-5",
  Sonnet = "claude-sonnet-4-6",
  Opus = "claude-opus-4-6",
}

export enum PrivacyTier {
  Safe = "safe",
  Sensitive = "sensitive",
  Private = "private",
}

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model: ModelTier;
  description: string;
  tools: string[];
  memoryEnabled: boolean;
  privacyTier: PrivacyTier;
  thinkingEnabled: boolean;
  thinkingBudgetTokens: number;
}

export interface AgentStatusEntry {
  agentId: string;
  status: AgentStatus;
  currentStep: string | null;
  progress: number;           // 0–100
  tokenCount: number;
  error: string | null;
  startedAt: number | null;   // unix ms
  finishedAt: number | null;
}
