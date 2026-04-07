// AGUIEventRouter.ts — AG-UI event dispatcher (Patterns 11 + 13)
//
// Routes incoming ServerMessages to the correct Zustand store action.
// Implements RAF buffering for TEXT_MESSAGE_CONTENT and thinking_delta events
// so token updates are batched once per animation frame (max 60/sec),
// not per-token (up to 100/sec per agent × N agents).

import type { ServerMessage, AgentEvent, CustomEvent } from "@mao/shared-types";
import { AgentStatus } from "@mao/shared-types";
import { useGraphStore } from "@/stores/graphStore";
import { useStreamingStore } from "@/stores/streamingStore";
import { useAgentStatusStore } from "@/stores/agentStatusStore";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { NodeType, NodeLevel, type NodeDataUnion } from "@mao/shared-types";
import type { Node } from "@xyflow/react";

// ── RAF token buffer ──────────────────────────────────────────────────────────

type NodeId = string;

export class AGUIEventRouter {
  // Buffers pending token batches per node — flushed once per RAF frame
  private tokenBuffers = new Map<NodeId, string>();
  private rafId: number | null = null;

  constructor() {
    this._startRAFLoop();
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.tokenBuffers.clear();
  }

  // ── Main dispatch ───────────────────────────────────────────────────────────

  route(msg: ServerMessage): void {
    switch (msg.type) {
      case "event":
        this._handleEvent(msg.event);
        break;
      case "status":
        this._handleStatus(msg);
        break;
      case "connected":
        console.debug("[Router] connected", msg.sessionId);
        break;
      case "error":
        console.error("[Router] server error", msg.code, msg.message);
        break;
      case "pong":
        // Latency monitoring hook — no store update needed
        break;
    }
  }

  // ── AG-UI event handler ─────────────────────────────────────────────────────

  private _handleEvent(event: AgentEvent): void {
    const graphStore = useGraphStore.getState();
    const streamingStore = useStreamingStore.getState();
    const statusStore = useAgentStatusStore.getState();

    switch (event.type) {
      // ── Lifecycle ────────────────────────────────────────────────────────────
      case "RUN_STARTED":
        statusStore.setStatus(event.agentId, AgentStatus.Running);
        this._ensureSpecialistNode(event.agentId, event.agentName ?? event.agentId);
        break;

      case "RUN_FINISHED":
        statusStore.setStatus(event.agentId, AgentStatus.Complete);
        break;

      case "RUN_ERROR":
        statusStore.setError(event.agentId, event.error);
        break;

      // ── Steps ────────────────────────────────────────────────────────────────
      case "STEP_STARTED":
        statusStore.setProgress(event.agentId, 50, event.stepName);
        this._ensureStepNode(event.stepId, event.agentId, event.stepType, event.stepName);
        break;

      case "STEP_FINISHED":
        statusStore.setProgress(event.agentId, 90, null);
        break;

      // ── Text streaming — buffer, don't dispatch per token ────────────────────
      case "TEXT_MESSAGE_START":
        streamingStore.startStream(
          event.nodeId,
          event.agentId,
          event.messageId,
          event.isThinking,
          320 // default node width — updated by ThinkingStreamNode on mount
        );
        this._ensureThinkingNode(event.nodeId, event.stepId ?? event.agentId);
        break;

      case "TEXT_MESSAGE_CONTENT":
        this._bufferToken(event.nodeId, event.delta);
        break;

      case "TEXT_MESSAGE_END":
        // Flush any remaining buffer immediately
        this._flushNode(event.nodeId);
        streamingStore.endStream(event.nodeId);
        break;

      // ── Tool calls ───────────────────────────────────────────────────────────
      case "TOOL_CALL_START":
        this._ensureToolCallNode(event.toolCallId, event.nodeId, event.agentId, event.toolName);
        break;

      case "TOOL_CALL_END":
        graphStore.updateNodeData(event.nodeId, {
          status: event.status,
          durationMs: event.durationMs,
        } as Partial<NodeDataUnion>);
        break;

      // ── State ────────────────────────────────────────────────────────────────
      case "STATE_SNAPSHOT":
        graphStore.syncFromSnapshot(event.snapshot);
        break;

      case "STATE_DELTA":
        // JSON patch applied to graph state — handled by graphStore
        console.debug("[Router] STATE_DELTA", event.delta.length, "ops");
        break;

      // ── Custom MAO events ────────────────────────────────────────────────────
      case "CUSTOM":
        this._handleCustom(event as CustomEvent);
        break;
    }
  }

  private _handleCustom(event: CustomEvent): void {
    const { customType, payload } = event;
    const streamingStore = useStreamingStore.getState();
    const memoryStore = useMemoryGraphStore.getState();

    switch (customType) {
      case "thinking_delta":
        // Thinking tokens go through the same RAF buffer
        this._bufferToken(payload.nodeId, payload.delta);
        break;

      case "agent_handoff": {
        const graphStore = useGraphStore.getState();
        graphStore.addEdge({
          id: `handoff-${payload.fromAgentId}-${payload.toAgentId}-${Date.now()}`,
          source: payload.fromAgentId,
          target: payload.toAgentId,
          type: "handoff",
          animated: true,
          label: payload.reason?.slice(0, 40),
        });
        break;
      }

      case "memory_update":
        memoryStore.applyMemoryDelta(payload.delta);
        break;

      case "conflict_detected":
        console.warn("[Memory] conflict detected", payload.entityAId, "vs", payload.entityBId);
        break;

      case "heartbeat":
        // Could update a connection status indicator
        break;
    }
  }

  private _handleStatus(msg: Extract<ServerMessage, { type: "status" }>): void {
    console.debug("[Router] workflow status:", msg.status, msg.workflowId);
  }

  // ── RAF token batching (Pattern 11) ─────────────────────────────────────────

  private _bufferToken(nodeId: NodeId, delta: string): void {
    const current = this.tokenBuffers.get(nodeId) ?? "";
    this.tokenBuffers.set(nodeId, current + delta);
  }

  private _startRAFLoop(): void {
    const flush = () => {
      this.rafId = requestAnimationFrame(flush);
      if (this.tokenBuffers.size === 0) return;

      const streamingStore = useStreamingStore.getState();
      for (const [nodeId, batch] of this.tokenBuffers) {
        streamingStore.appendBatch(nodeId, batch);
      }
      this.tokenBuffers.clear();
    };
    this.rafId = requestAnimationFrame(flush);
  }

  private _flushNode(nodeId: NodeId): void {
    const batch = this.tokenBuffers.get(nodeId);
    if (batch) {
      useStreamingStore.getState().appendBatch(nodeId, batch);
      this.tokenBuffers.delete(nodeId);
    }
  }

  // ── Node creation helpers ────────────────────────────────────────────────────

  private _ensureSpecialistNode(agentId: string, agentName: string): void {
    const { nodes, addNode } = useGraphStore.getState();
    if (nodes.find((n) => n.id === agentId)) return;

    const node: Node<NodeDataUnion> = {
      id: agentId,
      type: NodeType.Specialist,
      position: { x: 0, y: 0 }, // ELK will position
      data: {
        level: NodeLevel.Specialist,
        agentId,
        agentName,
        role: "research" as any,
        model: (event as any).model ?? "unknown",
        tools: [],
        status: AgentStatus.Running,
        tokenCount: 0,
        expanded: false,
        currentStep: null,
      },
    };
    addNode(node);
    useGraphStore.getState().bumpLayout();
  }

  private _ensureStepNode(stepId: string, agentId: string, stepType: string, stepName: string): void {
    const { nodes, addNode, addEdge } = useGraphStore.getState();
    if (nodes.find((n) => n.id === stepId)) return;

    const node: Node<NodeDataUnion> = {
      id: stepId,
      type: NodeType.ExecutionStep,
      position: { x: 0, y: 0 },
      hidden: true, // hidden until parent is expanded
      parentId: agentId,
      data: {
        level: NodeLevel.ExecutionStep,
        stepId,
        agentId,
        stepType: stepType as any,
        stepName,
        inputPreview: null,
        outputPreview: null,
        durationMs: null,
        tokenCount: null,
        expanded: false,
        hasThinking: false,
      },
    };
    addNode(node);
    addEdge({
      id: `${agentId}-${stepId}`,
      source: agentId,
      target: stepId,
      type: "agentFlow",
      hidden: true,
    });
  }

  private _ensureThinkingNode(nodeId: string, parentStepId: string): void {
    const { nodes, addNode, addEdge } = useGraphStore.getState();
    if (nodes.find((n) => n.id === nodeId)) return;

    const node: Node<NodeDataUnion> = {
      id: nodeId,
      type: NodeType.ThinkingStream,
      position: { x: 0, y: 0 },
      hidden: true,
      parentId: parentStepId,
      data: {
        level: NodeLevel.ThinkingStream,
        stepId: parentStepId,
        agentId: "",
        isStreaming: true,
        textLength: 0,
        nodeWidth: 320,
      },
    };
    addNode(node);
    addEdge({
      id: `${parentStepId}-${nodeId}`,
      source: parentStepId,
      target: nodeId,
      type: "agentFlow",
      hidden: true,
    });
  }

  private _ensureToolCallNode(
    toolCallId: string,
    nodeId: string,
    agentId: string,
    toolName: string
  ): void {
    const { nodes, addNode, addEdge } = useGraphStore.getState();
    if (nodes.find((n) => n.id === nodeId)) return;

    const node: Node<NodeDataUnion> = {
      id: nodeId,
      type: NodeType.ToolCall,
      position: { x: 0, y: 0 },
      hidden: true,
      parentId: agentId,
      data: {
        level: NodeLevel.ExecutionStep,
        stepId: toolCallId,
        agentId,
        stepType: "tool_use" as any,
        toolName,
        toolArgs: {},
        toolResult: null,
        status: "running",
        durationMs: null,
        expanded: false,
        hasThinking: false,
      },
    };
    addNode(node);
    addEdge({
      id: `${agentId}-${nodeId}`,
      source: agentId,
      target: nodeId,
      type: "toolCall",
      hidden: true,
    });
  }
}
