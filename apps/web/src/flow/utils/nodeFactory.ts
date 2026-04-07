// flow/utils/nodeFactory.ts — Typed Node<T> factory functions.
//
// Enforces correct nodeType, dimensions, parentId, and hidden state
// for every level. Used by AGUIEventRouter and useGraphBuilder.

import type { Node } from "@xyflow/react";
import {
  NodeType,
  NodeLevel,
  AgentStatus,
  type OrchestratorNodeData,
  type SpecialistNodeData,
  type ExecutionStepNodeData,
  type ToolCallNodeData,
  type ThinkingStreamNodeData,
  type NodeDataUnion,
  StepType,
} from "@mao/shared-types";
import { NODE_WIDTH } from "@/utils/constants";

// ── Level 1 ───────────────────────────────────────────────────────────────────

export function createOrchestratorNode(
  workflowId: string,
  workflowName: string
): Node<OrchestratorNodeData> {
  return {
    id:       workflowId,
    type:     NodeType.Orchestrator,
    position: { x: 0, y: 0 },
    width:    NODE_WIDTH,
    height:   80,
    data: {
      level:        NodeLevel.Orchestrator,
      workflowId,
      workflowName,
      status:       AgentStatus.Running,
      agentCount:   0,
      totalTokens:  0,
      expanded:     false,
      startedAt:    Date.now(),
    },
  };
}

// ── Level 2 ───────────────────────────────────────────────────────────────────

export function createSpecialistNode(
  agentId:    string,
  agentName:  string,
  role:       string,
  model:      string,
  tools:      string[],
  parentId:   string
): Node<SpecialistNodeData> {
  return {
    id:       agentId,
    type:     NodeType.Specialist,
    position: { x: 0, y: 0 },
    parentId,
    hidden:   true,           // hidden until orchestrator expands
    extent:   "parent",
    width:    NODE_WIDTH,
    height:   96,
    data: {
      level:        NodeLevel.Specialist,
      agentId,
      agentName,
      role:         role as any,
      model:        model as any,
      tools,
      status:       AgentStatus.Idle,
      tokenCount:   0,
      expanded:     false,
      currentStep:  null,
    },
  };
}

// ── Level 3 ───────────────────────────────────────────────────────────────────

export function createExecutionStepNode(
  stepId:    string,
  agentId:   string,
  stepType:  StepType,
  stepName:  string,
  parentId:  string
): Node<ExecutionStepNodeData> {
  return {
    id:       stepId,
    type:     NodeType.ExecutionStep,
    position: { x: 0, y: 0 },
    parentId,
    hidden:   true,
    extent:   "parent",
    width:    NODE_WIDTH,
    height:   64,
    data: {
      level:         NodeLevel.ExecutionStep,
      stepId,
      agentId,
      stepType,
      stepName,
      inputPreview:  null,
      outputPreview: null,
      durationMs:    null,
      tokenCount:    null,
      expanded:      false,
      hasThinking:   false,
    },
  };
}

export function createToolCallNode(
  toolCallId: string,
  nodeId:     string,
  agentId:    string,
  toolName:   string,
  parentId:   string
): Node<ToolCallNodeData> {
  return {
    id:       nodeId,
    type:     NodeType.ToolCall,
    position: { x: 0, y: 0 },
    parentId,
    hidden:   true,
    extent:   "parent",
    width:    NODE_WIDTH,
    height:   64,
    data: {
      level:        NodeLevel.ExecutionStep,
      stepId:       toolCallId,
      agentId,
      stepType:     StepType.ToolUse,
      toolName,
      toolArgs:     {},
      toolResult:   null,
      status:       "running",
      durationMs:   null,
      expanded:     false,
      hasThinking:  false,
    },
  };
}

// ── Level 4 ───────────────────────────────────────────────────────────────────

export function createThinkingStreamNode(
  nodeId:    string,
  agentId:   string,
  parentId:  string
): Node<ThinkingStreamNodeData> {
  return {
    id:       nodeId,
    type:     NodeType.ThinkingStream,
    position: { x: 0, y: 0 },
    parentId,
    hidden:   true,
    extent:   "parent",
    width:    NODE_WIDTH,
    height:   80,          // updated by ThinkingStreamNode via Pretext
    data: {
      level:       NodeLevel.ThinkingStream,
      stepId:      parentId,
      agentId,
      isStreaming: true,
      textLength:  0,
      nodeWidth:   NODE_WIDTH,
    },
  };
}

// ── Generic typed wrapper ─────────────────────────────────────────────────────

/** Type guard — check that a node has the expected level. */
export function isNodeLevel<T extends NodeDataUnion>(
  node: Node<NodeDataUnion>,
  level: T["level"]
): node is Node<T> {
  return (node.data as NodeDataUnion).level === level;
}
