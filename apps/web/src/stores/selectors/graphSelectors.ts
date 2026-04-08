// selectors/graphSelectors.ts
import { useShallow } from "zustand/react/shallow";
import { useGraphStore } from "../graphStore";

export const useVisibleNodes = () =>
  useGraphStore(useShallow((s) => s.nodes.filter((n) => !n.hidden)));

export const useVisibleEdges = () =>
  useGraphStore(useShallow((s) => s.edges.filter((e) => !e.hidden)));

export const useNodeById = (id: string) =>
  useGraphStore((s) => s.nodes.find((n) => n.id === id));

export const useChildrenOf = (parentId: string) =>
  useGraphStore((s) => s.nodes.filter((n) => n.parentId === parentId));

export const useIsExpanded = (id: string) =>
  useGraphStore((s) => s.expandedIds.has(id));

export const useSelectedNode = () =>
  useGraphStore(
    useShallow((s) => ({
      id: s.selectedNodeId,
      node: s.nodes.find((n) => n.id === s.selectedNodeId),
    }))
  );
