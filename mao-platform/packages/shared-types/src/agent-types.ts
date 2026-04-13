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

// ModelTier is kept for backward compatibility with Anthropic-specific UI hints.
// For non-Anthropic models, the model field on AgentConfig is a free string.
export enum ModelTier {
  // Anthropic
  Haiku  = "claude-haiku-4-5",
  Sonnet = "claude-sonnet-4-6",
  Opus   = "claude-opus-4-6",
  // OpenRouter shortcuts (the actual model IDs are the full string)
  GPT4o        = "openai/gpt-4o",
  GPT4oMini    = "openai/gpt-4o-mini",
  GeminiFlash  = "google/gemini-2.0-flash-exp",
  Llama70B     = "meta-llama/llama-3.3-70b-instruct",
  // Ollama — prefix "ollama/"
  OllamaLlama  = "ollama/llama3.2",
  OllamaMistral= "ollama/mistral",
}

// Use this type anywhere the model ID is a free string (registry entries, API responses)
export type ModelId = ModelTier | string;

export enum PrivacyTier {
  Safe = "safe",
  Sensitive = "sensitive",
  Private = "private",
}

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model: ModelId;  // any provider model ID
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
