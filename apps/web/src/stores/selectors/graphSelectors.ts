// selectors/graphSelectors.ts
import { useMemo } from "react";
import { useGraphStore } from "../graphStore";

export const useVisibleNodes = () => {
  const nodes = useGraphStore((s) => s.nodes);
  return useMemo(() => nodes.filter((n) => !n.hidden), [nodes]);
};

export const useVisibleEdges = () => {
  const edges = useGraphStore((s) => s.edges);
  return useMemo(() => edges.filter((e) => !e.hidden), [edges]);
};

export const useNodeById = (id: string) =>
  useGraphStore((s) => s.nodes.find((n) => n.id === id));

export const useChildrenOf = (parentId: string) =>
  useGraphStore((s) => s.nodes.filter((n) => n.parentId === parentId));

export const useIsExpanded = (id: string) =>
  useGraphStore((s) => s.expandedIds.has(id));

export const useSelectedNode = () =>
  useGraphStore((s) => {
    const id = s.selectedNodeId;
    return id ? s.nodes.find((n) => n.id === id) ?? null : null;
  });
