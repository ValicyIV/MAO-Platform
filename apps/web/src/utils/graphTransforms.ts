// graphTransforms.ts — Pure topology → React Flow conversion functions.
// No side effects. No store access. Testable in isolation.

import type { Node, Edge } from "@xyflow/react";
import {
  NodeType,
  NodeLevel,
  AgentStatus,
  type NodeDataUnion,
  type OrchestratorNodeData,
  type SpecialistNodeData,
} from "@mao/shared-types";
import { NODE_WIDTH } from "./constants";

// ── Node factories ─────────────────────────────────────────────────────────────

export function makeOrchestratorNode(
  workflowId: string,
  workflowName: string
): Node<OrchestratorNodeData> {
  return {
    id: workflowId,
    type: NodeType.Orchestrator,
    position: { x: 0, y: 0 },
    data: {
      level: NodeLevel.Orchestrator,
      workflowId,
      workflowName,
      status: AgentStatus.Running,
      agentCount: 0,
      totalTokens: 0,
      expanded: false,
      startedAt: Date.now(),
    },
    width: NODE_WIDTH,
    height: 72,
  };
}

export function makeSpecialistNode(
  agentId: string,
  agentName: string,
  role: string,
  model: string,
  tools: string[],
  parentId: string
): Node<SpecialistNodeData> {
  return {
    id: agentId,
    type: NodeType.Specialist,
    position: { x: 0, y: 0 },
    hidden: true, // hidden until orchestrator is expanded
    parentId,
    extent: "parent" as const,
    data: {
      level: NodeLevel.Specialist,
      agentId,
      agentName,
      role: role as any,
      model: model as any,
      tools,
      status: AgentStatus.Idle,
      tokenCount: 0,
      expanded: false,
      currentTopic: null,
      topicReason: null,
      currentStep: null,
    },
    width: NODE_WIDTH,
    height: 88,
  };
}

// ── Edge factories ──────────────────────────────────────────────────────────────

export function makeDelegationEdge(
  orchestratorId: string,
  agentId: string
): Edge {
  return {
    id: `${orchestratorId}->${agentId}`,
    source: orchestratorId,
    target: agentId,
    type: NodeType.Orchestrator, // will use AgentFlowEdge via edgeTypes
    hidden: true,
    animated: false,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/**
 * Walk up the parentId chain and return an ordered list of ancestor node IDs,
 * from root to direct parent.
 */
export function getAncestorChain(
  nodeId: string,
  nodes: Node<NodeDataUnion>[]
): string[] {
  const chain: string[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    chain.unshift(current.parentId);
    current = nodeMap.get(current.parentId);
  }
  return chain;
}

/**
 * Given a flat node list, return only the nodes visible at the current
 * expand state (i.e. not hidden).
 */
export function getVisibleSubtree(
  nodes: Node<NodeDataUnion>[],
  expandedIds: Set<string>
): Node<NodeDataUnion>[] {
  return nodes.filter((n) => {
    if (!n.parentId) return true; // top-level always visible
    return expandedIds.has(n.parentId);
  });
}

/**
 * Assign sequential x positions for sibling nodes at the same level,
 * centred around a parent node. Used before ELK takes over.
 */
export function spreadSiblings(
  siblings: Node<NodeDataUnion>[],
  parentX: number,
  yOffset: number,
  gap = 40
): Node<NodeDataUnion>[] {
  const total = siblings.length;
  const totalWidth = total * NODE_WIDTH + (total - 1) * gap;
  const startX = parentX - totalWidth / 2;
  return siblings.map((node, i) => ({
    ...node,
    position: {
      x: startX + i * (NODE_WIDTH + gap),
      y: yOffset,
    },
  }));
}
