// protocol/eventHandlers.ts — Pure handler functions, one per AG-UI event type.
//
// Each function takes an event + store handles and returns void.
// Pure: no direct store imports here — stores are passed in as arguments.
// This makes handlers trivially unit-testable.
//
// The AGUIEventRouter calls these via its internal switch statement.

import type {
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StepStartedEvent,
  StepFinishedEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  StateSnapshotEvent,
  CustomEvent,
} from "@mao/shared-types";
import { AgentStatus } from "@mao/shared-types";

// ── Store handle types (passed in from AGUIEventRouter) ───────────────────────

interface Stores {
  graph: {
    addNode: (node: any) => void;
    addEdge: (edge: any) => void;
    updateNodeData: (id: string, data: any) => void;
    syncFromSnapshot: (snapshot: any) => void;
    bumpLayout: () => void;
  };
  streaming: {
    startStream: (nodeId: string, agentId: string, messageId: string, isThinking: boolean, nodeWidth: number) => void;
    endStream: (nodeId: string) => void;
  };
  status: {
    setStatus: (agentId: string, status: AgentStatus) => void;
    setProgress: (agentId: string, progress: number, step: string | null) => void;
    setError: (agentId: string, error: string) => void;
  };
  memory: {
    applyMemoryDelta: (delta: any) => void;
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export function handleRunStarted(event: RunStartedEvent, stores: Stores): void {
  stores.status.setStatus(event.agentId, AgentStatus.Running);
}

export function handleRunFinished(event: RunFinishedEvent, stores: Stores): void {
  stores.status.setStatus(event.agentId, AgentStatus.Complete);
}

export function handleRunError(event: RunErrorEvent, stores: Stores): void {
  stores.status.setError(event.agentId, event.error);
}

export function handleStepStarted(event: StepStartedEvent, stores: Stores): void {
  stores.status.setProgress(event.agentId, 50, event.stepName);
}

export function handleStepFinished(event: StepFinishedEvent, stores: Stores): void {
  stores.status.setProgress(event.agentId, 90, null);
}

export function handleTextMessageStart(event: TextMessageStartEvent, stores: Stores): void {
  stores.streaming.startStream(
    event.nodeId,
    event.agentId,
    event.messageId,
    event.isThinking,
    320
  );
}

export function handleTextMessageContent(_event: TextMessageContentEvent, _stores: Stores): void {
  // Buffered by RAF loop in AGUIEventRouter — not dispatched directly
}

export function handleTextMessageEnd(event: TextMessageEndEvent, stores: Stores): void {
  stores.streaming.endStream(event.nodeId);
}

export function handleToolCallStart(_event: ToolCallStartEvent, _stores: Stores): void {
  // Node creation handled by AGUIEventRouter._ensureToolCallNode
}

export function handleToolCallEnd(event: ToolCallEndEvent, stores: Stores): void {
  stores.graph.updateNodeData(event.nodeId, {
    toolResult: event.result,
    status: event.status,
    durationMs: event.durationMs,
  });
}

export function handleStateSnapshot(event: StateSnapshotEvent, stores: Stores): void {
  stores.graph.syncFromSnapshot(event.snapshot);
}

export function handleCustom(event: CustomEvent, stores: Stores): void {
  switch (event.customType) {
    case "memory_update":
      stores.memory.applyMemoryDelta(event.payload.delta);
      break;
    case "agent_handoff":
      stores.graph.addEdge({
        id: `handoff-${event.payload.fromAgentId}-${event.payload.toAgentId}-${event.timestamp}`,
        source: event.payload.fromAgentId,
        target: event.payload.toAgentId,
        type: "handoff",
        animated: true,
      });
      break;
  }
}
