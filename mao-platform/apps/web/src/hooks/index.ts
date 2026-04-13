// hooks/useStreamingText.ts
// Subscribes to streamingStore for a specific nodeId via shallow selector.
// Only re-renders when THIS node's stream changes.

import { useStreamingStore } from "@/stores/streamingStore";
import type { StreamingState } from "@mao/shared-types";

export function useStreamingText(nodeId: string): StreamingState | undefined {
  return useStreamingStore((s) => s.streams[nodeId]);
}

// ──────────────────────────────────────────────────────────────────────────────

// hooks/usePretextMeasure.ts
// Returns Pretext-measured height for streaming text.
// Deps: [text.length, nodeWidth] — NOT the full text string (avoid re-renders on every char).

import { useMemo } from "react";
import { PretextService } from "@/services/PretextService";

export function usePretextMeasure(
  nodeId: string,
  textLength: number,        // length, not full text — node reads text via ref
  text: string,
  nodeWidth: number,
  lineHeight?: number
): number {
  return useMemo(
    () => PretextService.getHeight(nodeId, text, nodeWidth, lineHeight),
    [nodeId, textLength, nodeWidth, lineHeight]
  );
}

// ──────────────────────────────────────────────────────────────────────────────

// hooks/useAgentStatus.ts
// Subscribes to agentStatusStore for a specific agentId.

import { useAgentStatusStore } from "@/stores/agentStatusStore";
import type { AgentStatusEntry } from "@mao/shared-types";

export function useAgentStatus(agentId: string): AgentStatusEntry | undefined {
  return useAgentStatusStore((s) => s.statuses[agentId]);
}

// ──────────────────────────────────────────────────────────────────────────────

// hooks/useAgentConnection.ts
// Initialises the WebSocket connection for a workflow and tracks status.

import { useEffect, useState, useCallback } from "react";
import { WebSocketService } from "@/services/WebSocketService";

interface ConnectionState {
  connected: boolean;
  workflowId: string | null;
  connect: (workflowId: string, task: string) => void;
  disconnect: () => void;
}

export function useAgentConnection(): ConnectionState {
  const [connected, setConnected] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const connect = useCallback((wfId: string, task: string) => {
    const svc = WebSocketService.getInstance();
    svc.connect(wfId);
    setWorkflowId(wfId);
    setConnected(true);
    svc.execute(task);
  }, []);

  const disconnect = useCallback(() => {
    WebSocketService.getInstance().disconnect();
    setConnected(false);
    setWorkflowId(null);
  }, []);

  useEffect(() => {
    return () => {
      WebSocketService.getInstance().disconnect();
    };
  }, []);

  return { connected, workflowId, connect, disconnect };
}
