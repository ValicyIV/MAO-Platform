// selectors/graphSelectors.ts
import type { Node, Edge } from "@xyflow/react";
import type { NodeDataUnion } from "@mao/shared-types";
import { useGraphStore } from "../graphStore";

export const useVisibleNodes = () =>
  useGraphStore((s) => s.nodes.filter((n) => !n.hidden));

export const useVisibleEdges = () =>
  useGraphStore((s) => s.edges.filter((e) => !e.hidden));

export const useNodeById = (id: string) =>
  useGraphStore((s) => s.nodes.find((n) => n.id === id));

export const useChildrenOf = (parentId: string) =>
  useGraphStore((s) => s.nodes.filter((n) => n.parentId === parentId));

export const useIsExpanded = (id: string) =>
  useGraphStore((s) => s.expandedIds.has(id));

export const useSelectedNode = () =>
  useGraphStore((s) => ({
    id: s.selectedNodeId,
    node: s.nodes.find((n) => n.id === s.selectedNodeId),
  }));
