// AGUIEventRouter.ts — AG-UI event dispatcher (Patterns 11 + 13)
//
// Routes incoming ServerMessages to the correct Zustand store action.
// Implements RAF buffering for TEXT_MESSAGE_CONTENT and thinking_delta events
// so token updates are batched once per animation frame (max 60/sec),
// not per-token (up to 100/sec per agent × N agents).

import type { ServerMessage, AgentEvent, CustomEvent, MAOEventPayloadMap } from "@mao/shared-types";
import { AgentStatus, AgentRole, type RunStartedEvent } from "@mao/shared-types";
import { applyMiddleware, DEFAULT_MIDDLEWARE } from "@/protocol/middleware";
import { MAO_EVENTS } from "@/protocol/customEvents";
import { useGraphStore } from "@/stores/graphStore";
import { useStreamingStore } from "@/stores/streamingStore";
import { useAgentStatusStore } from "@/stores/agentStatusStore";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { NodeType, NodeLevel, type NodeDataUnion } from "@mao/shared-types";
import type { Node } from "@xyflow/react";

// ── RAF token buffer ──────────────────────────────────────────────────────────

type NodeId = string;
const WORKFLOW_ROOT_ID = "__workflow_root__";

function coerceAgentRole(role: string | undefined): AgentRole {
  if (!role) return AgentRole.Research;
  const lc = role.toLowerCase();
  const map: Record<string, AgentRole> = {
    orchestrator: AgentRole.Orchestrator,
    supervisor: AgentRole.Orchestrator,
    research: AgentRole.Research,
    code: AgentRole.Code,
    data: AgentRole.Data,
    writer: AgentRole.Writer,
    verifier: AgentRole.Verifier,
  };
  return map[lc] ?? AgentRole.Research;
}

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
    try {
      switch (msg.type) {
        case "event": {
          if (!msg.event || typeof msg.event !== "object") break;
          const processed = applyMiddleware(msg.event as AgentEvent, DEFAULT_MIDDLEWARE);
          if (processed) this._handleEvent(processed);
          break;
        }
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
          break;
      }
    } catch (e) {
      console.error("[Router] route() error:", e);
    }
  }

  // ── AG-UI event handler ─────────────────────────────────────────────────────

  private _handleEvent(event: AgentEvent): void {
    try {
      this._handleEventInner(event);
    } catch (e) {
      console.error("[Router] _handleEvent error:", e, event);
    }
  }

  private _handleEventInner(event: AgentEvent): void {
    const graphStore = useGraphStore.getState();
    const streamingStore = useStreamingStore.getState();
    const statusStore = useAgentStatusStore.getState();

    switch (event.type) {
      // ── Lifecycle ────────────────────────────────────────────────────────────
      case "RUN_STARTED": {
        const ev = event as RunStartedEvent;
        this._ensureWorkflowRoot(ev.runId ?? ev.workflowId ?? "workflow");
        statusStore.setStatus(ev.agentId, AgentStatus.Running);
        this._ensureSpecialistNode(ev);
        break;
      }

      case "RUN_FINISHED":
        statusStore.setStatus(event.agentId, AgentStatus.Complete);
        break;

      case "RUN_ERROR":
        statusStore.setError(event.agentId, event.error);
        break;

      // ── Steps ────────────────────────────────────────────────────────────────
      case "STEP_STARTED":
        this._ensureWorkflowRoot(event.runId);
        this._ensureAgentShell(event.agentId);
        statusStore.setProgress(event.agentId, 50, event.stepName);
        this._ensureStepNode(event.stepId, event.agentId, event.stepType, event.stepName);
        break;

      case "STEP_FINISHED":
        statusStore.setProgress(event.agentId, 90, undefined);
        break;

      // ── Text streaming — buffer, don't dispatch per token ────────────────────
      case "TEXT_MESSAGE_START":
        this._ensureWorkflowRoot(event.runId);
        this._ensureAgentShell(event.agentId);
        streamingStore.startStream(
          event.nodeId,
          event.agentId,
          event.messageId,
          event.isThinking,
          320 // default node width — updated by ThinkingStreamNode on mount
        );
        this._ensureThinkingNode(event.nodeId, event.stepId ?? event.agentId, event.agentId);
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
        this._ensureWorkflowRoot(event.runId);
        this._ensureAgentShell(event.agentId);
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
        graphStore.applyStateDelta(event.delta);
        break;

      // ── Custom MAO events ────────────────────────────────────────────────────
      case "CUSTOM":
        this._handleCustom(event as CustomEvent);
        break;
    }
  }


  private _handleCustom(event: CustomEvent): void {
    const { customType, payload } = event;
    const memoryStore = useMemoryGraphStore.getState();

    switch (customType) {
      case MAO_EVENTS.THINKING_DELTA: {
        const p = payload as MAOEventPayloadMap["thinking_delta"];
        // Thinking tokens go through the same RAF buffer
        this._bufferToken(p.nodeId, p.delta);
        break;
      }

      case MAO_EVENTS.AGENT_HANDOFF: {
        const p = payload as MAOEventPayloadMap["agent_handoff"];
        const graphStore = useGraphStore.getState();
        graphStore.addEdge({
          id: `handoff-${p.fromAgentId}-${p.toAgentId}-${Date.now()}`,
          source: p.fromAgentId,
          target: p.toAgentId,
          type: "handoff",
          animated: true,
          label: p.reason?.slice(0, 40),
        });
        break;
      }

      case MAO_EVENTS.MEMORY_UPDATE: {
        const p = payload as MAOEventPayloadMap["memory_update"];
        memoryStore.applyMemoryDelta(p.delta);
        break;
      }

      case MAO_EVENTS.CONFLICT_DETECTED: {
        const p = payload as MAOEventPayloadMap["conflict_detected"];
        console.warn("[Memory] conflict detected", p.entityAId, "vs", p.entityBId);
        break;
      }

      case MAO_EVENTS.HEARTBEAT:
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

  private _ensureWorkflowRoot(workflowId: string): void {
    const { nodes, addNode } = useGraphStore.getState();
    if (nodes.find((n) => n.id === WORKFLOW_ROOT_ID)) return;
    const node: Node<NodeDataUnion> = {
      id: WORKFLOW_ROOT_ID,
      type: NodeType.Orchestrator,
      position: { x: 0, y: 0 },
      data: {
        level: NodeLevel.Orchestrator,
        workflowId: workflowId || "workflow",
        workflowName: "MAO Workflow",
        status: AgentStatus.Running,
        agentCount: 0,
        totalTokens: 0,
        expanded: true,
        startedAt: Date.now(),
      },
    };
    addNode(node);
    useGraphStore.getState().bumpLayout();
  }

  private _ensureSpecialistNode(ev: RunStartedEvent): void {
    const { agentId, agentName, role, model, tools } = ev;
    const { nodes, addNode } = useGraphStore.getState();
    if (nodes.find((n) => n.id === agentId)) return;

    const node: Node<NodeDataUnion> = {
      id: agentId,
      type: NodeType.Specialist,
      position: { x: 0, y: 0 }, // ELK will position
      data: {
        level: NodeLevel.Specialist,
        agentId,
        agentName: agentName ?? agentId,
        role: coerceAgentRole(role),
        model: (model ?? "unknown") as any,
        tools: tools ?? [],
        status: AgentStatus.Running,
        tokenCount: 0,
        expanded: true,
        currentStep: null,
      },
    };
    addNode(node);
    useGraphStore.getState().addEdge({
      id: `${WORKFLOW_ROOT_ID}-${agentId}`,
      source: WORKFLOW_ROOT_ID,
      target: agentId,
      type: "agentFlow",
      hidden: false,
    });
    useGraphStore.getState().updateNodeData(WORKFLOW_ROOT_ID, {
      agentCount: useGraphStore.getState().nodes.filter((n) => n.type === NodeType.Specialist).length,
    } as Partial<NodeDataUnion>);
    useGraphStore.getState().bumpLayout();
  }

  private _ensureAgentShell(agentId: string): void {
    const normalized = (agentId || "unknown").trim() || "unknown";
    const { nodes, addNode } = useGraphStore.getState();
    if (nodes.find((n) => n.id === normalized)) return;
    const node: Node<NodeDataUnion> = {
      id: normalized,
      type: NodeType.Specialist,
      position: { x: 0, y: 0 },
      data: {
        level: NodeLevel.Specialist,
        agentId: normalized,
        agentName: normalized === "unknown" ? "Agent" : normalized,
        role: coerceAgentRole(normalized),
        model: "unknown" as any,
        tools: [],
        status: AgentStatus.Running,
        tokenCount: 0,
        expanded: true,
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
      hidden: false,
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
      hidden: false,
    });
    useGraphStore.getState().bumpLayout();
  }

  private _ensureThinkingNode(nodeId: string, parentStepId: string, agentId: string): void {
    const { nodes, addNode, addEdge } = useGraphStore.getState();
    if (nodes.find((n) => n.id === nodeId)) return;

    const node: Node<NodeDataUnion> = {
      id: nodeId,
      type: NodeType.ThinkingStream,
      position: { x: 0, y: 0 },
      hidden: false,
      data: {
        level: NodeLevel.ThinkingStream,
        stepId: parentStepId,
        agentId,
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
      hidden: false,
    });
    useGraphStore.getState().bumpLayout();
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
      hidden: false,
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
      hidden: false,
    });
    useGraphStore.getState().bumpLayout();
  }
}
