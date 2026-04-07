// ─────────────────────────────────────────────────────────────────────────────
// WebSocket Protocol
// Typed message shapes for the client↔server WebSocket connection.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentEvent } from "./agent-events.js";
import type { AgentConfig } from "./agent-types.js";

// ── Client → Server ───────────────────────────────────────────────────────────

export type ClientMessageType =
  | "execute"
  | "cancel"
  | "subscribe_memory"
  | "unsubscribe_memory"
  | "ping";

export interface ExecuteMessage {
  type: "execute";
  workflowId: string;
  task: string;
  agentOverrides?: Partial<AgentConfig>[];
}

export interface CancelMessage {
  type: "cancel";
  workflowId: string;
  reason?: string;
}

export interface SubscribeMemoryMessage {
  type: "subscribe_memory";
  agentId?: string;           // null = subscribe to all agents
}

export interface UnsubscribeMemoryMessage {
  type: "unsubscribe_memory";
}

export interface PingMessage {
  type: "ping";
  timestamp: number;
}

export type ClientMessage =
  | ExecuteMessage
  | CancelMessage
  | SubscribeMemoryMessage
  | UnsubscribeMemoryMessage
  | PingMessage;

// ── Server → Client ───────────────────────────────────────────────────────────

export type ServerMessageType =
  | "event"         // AG-UI agent event
  | "status"        // workflow-level status update
  | "error"         // server error
  | "pong"          // ping response
  | "connected";    // initial handshake

export interface EventMessage {
  type: "event";
  workflowId: string;
  event: AgentEvent;
}

export interface StatusMessage {
  type: "status";
  workflowId: string;
  status: "started" | "running" | "complete" | "cancelled" | "error";
  message?: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
  workflowId?: string;
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
  serverTimestamp: number;
}

export interface ConnectedMessage {
  type: "connected";
  sessionId: string;
  serverVersion: string;
  capabilities: string[];
}

export type ServerMessage =
  | EventMessage
  | StatusMessage
  | ErrorMessage
  | PongMessage
  | ConnectedMessage;
