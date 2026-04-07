// ─────────────────────────────────────────────────────────────────────────────
// Streaming Types
// State shapes for the streamingStore — isolated from graph topology.
// ─────────────────────────────────────────────────────────────────────────────

// Represents the live state of a single ThinkingStreamNode
export interface StreamingState {
  nodeId: string;
  agentId: string;
  messageId: string;
  text: string;              // accumulated text (direct DOM mutation target)
  isStreaming: boolean;
  isThinking: boolean;       // true = extended thinking block
  nodeWidth: number;         // passed from node component for Pretext layout
  measuredHeight: number;    // computed by PretextService, drives updateNode()
  startedAt: number;
  endedAt: number | null;
  totalTokens: number;
}

// Batch of tokens flushed by the RAF loop (never per-token)
export interface TokenBatch {
  nodeId: string;
  text: string;              // joined accumulated buffer since last flush
  timestamp: number;
}

// Pretext handle — opaque reference stored outside React state
// The actual PreparedText type lives in @chenglou/pretext
export interface PreparedTextRef {
  nodeId: string;
  textLength: number;        // used to detect stale cache entries
  // handle: PreparedText — typed as unknown here to avoid importing pretext in shared types
  handle: unknown;
}
