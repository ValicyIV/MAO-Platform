// flow/utils/layoutEngine.ts — ELK layout engine configuration.
//
// Exports the canonical ELK options used by useAutoLayout and
// a standalone computeLayout() for imperative use (e.g. after batch
// node creation before the first render).

import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import type { Node, Edge } from "@xyflow/react";
import type { NodeDataUnion } from "@mao/shared-types";

// ── ELK option sets ────────────────────────────────────────────────────────────

/** Radial bubble layout — orchestrator at center, specialists in orbit. */
export const WORKFLOW_ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm":                  "radial",
  "elk.radial.centerOnRoot":        "true",
  "elk.radial.orderId":             "1",
  "elk.radial.compactor":           "WEDGE_COMPACTION",
  "elk.spacing.nodeNode":           "60",
  "elk.padding":                    "[top=60, left=60, bottom=60, right=60]",
};

/** Force-directed layout for the memory knowledge graph. */
export const MEMORY_ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm":          "force",
  "elk.force.iterations":   "300",
  "elk.spacing.nodeNode":   "80",
  "elk.padding":            "[top=40, left=40, bottom=40, right=40]",
};

// ── Shared ELK instance ────────────────────────────────────────────────────────

const elk = new ELK();

// ── computeLayout ──────────────────────────────────────────────────────────────

export interface LayoutResult {
  nodes: Node<NodeDataUnion>[];
  edges: Edge[];
}

/**
 * Run ELK layout over the provided nodes and edges.
 * Returns updated nodes with x/y positions set.
 * Only processes visible (non-hidden) nodes.
 */
export async function computeLayout(
  nodes: Node<NodeDataUnion>[],
  edges: Edge[],
  options: Record<string, string> = WORKFLOW_ELK_OPTIONS
): Promise<LayoutResult> {
  const visibleNodes = nodes.filter((n) => !n.hidden);
  const visibleEdges = edges.filter((e) => !e.hidden);

  if (visibleNodes.length === 0) {
    return { nodes, edges };
  }

  // Radial layout: flat graph — all nodes at top level, edges define ring distance.
  // (Radial algorithm doesn't support INCLUDE_CHILDREN.)
  const isRadial = (options["elk.algorithm"] ?? "").toLowerCase() === "radial";

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: options,
    children: isRadial
      ? visibleNodes.map((n) => ({
          id: n.id,
          width: n.width ?? 176,
          height: n.height ?? 120,
        }))
      : visibleNodes
          .filter((n) => !n.parentId)
          .map((n) => buildElkNode(n, visibleNodes)),
    edges: visibleEdges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })) as ElkExtendedEdge[],
  };

  const layout = await elk.layout(elkGraph);
  const positionMap = flattenElkPositions(layout);

  const updatedNodes = nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: { x: pos.x, y: pos.y },
      ...(pos.width  ? { width:  pos.width  } : {}),
      ...(pos.height ? { height: pos.height } : {}),
    };
  });

  return { nodes: updatedNodes, edges };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildElkNode(
  node: Node<NodeDataUnion>,
  allNodes: Node<NodeDataUnion>[]
): ElkNode {
  const children = allNodes
    .filter((n) => n.parentId === node.id)
    .map((child) => buildElkNode(child, allNodes));

  return {
    id: node.id,
    width:    node.width  ?? 320,
    height:   node.height ?? 80,
    ...(children.length > 0 ? { children } : {}),
  };
}

/** Flatten ELK's nested result into a flat Map<id, {x, y, width?, height?}>. */
function flattenElkPositions(
  node: ElkNode,
  offsetX = 0,
  offsetY = 0
): Map<string, { x: number; y: number; width?: number; height?: number }> {
  const map = new Map<string, { x: number; y: number; width?: number; height?: number }>();
  const x = (node.x ?? 0) + offsetX;
  const y = (node.y ?? 0) + offsetY;

  if (node.id !== "root") {
    map.set(node.id, {
      x,
      y,
      ...(node.width !== undefined ? { width: node.width } : {}),
      ...(node.height !== undefined ? { height: node.height } : {}),
    });
  }

  for (const child of node.children ?? []) {
    // Children positions are relative to parent — pass parent's absolute position
    const childMap = flattenElkPositions(child, x, y);
    for (const [id, pos] of childMap) {
      map.set(id, pos);
    }
  }

  return map;
}
