// types/nodes.ts — React Flow Node<T> type specialisations.
// Provides typed shortcuts so callers don't have to repeat the generic parameter.

import type { Node } from "@xyflow/react";
import type {
  OrchestratorNodeData,
  SpecialistNodeData,
  ExecutionStepNodeData,
  ToolCallNodeData,
  ThinkingStreamNodeData,
  MemoryNodeData,
  NodeDataUnion,
} from "@mao/shared-types";

export type OrchestratorNode   = Node<OrchestratorNodeData>;
export type SpecialistNode     = Node<SpecialistNodeData>;
export type ExecutionStepNode  = Node<ExecutionStepNodeData>;
export type ToolCallNode       = Node<ToolCallNodeData>;
export type ThinkingStreamNode = Node<ThinkingStreamNodeData>;
export type MemoryEntityNode   = Node<MemoryNodeData>;
export type AnyFlowNode        = Node<NodeDataUnion>;
