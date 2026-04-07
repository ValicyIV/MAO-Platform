// hooks/useExpandCollapse.ts — 4-level expand/collapse (Pattern in §8)
//
// Manages the visibility of nested nodes across all four levels.
// When expanding: shows only immediate children (respects their own expand state).
// When collapsing: hides ALL descendants regardless of their expand state.
// After every toggle: debounced ELK re-layout via graphStore.bumpLayout().

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";

export function useExpandCollapse() {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const toggleExpand = useGraphStore((s) => s.toggleExpand);
  const getDescendants = useGraphStore((s) => s.getDescendants);
  const expandedIds = useGraphStore((s) => s.expandedIds);

  const toggle = useCallback(
    (nodeId: string) => {
      const isExpanded = expandedIds.has(nodeId);
      const allDescendants = getDescendants(nodeId);

      setNodes((nodes) =>
        nodes.map((node) => {
          // The node itself: update expanded data field
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, expanded: !isExpanded },
            };
          }

          // Immediate children of this node
          if (node.parentId === nodeId) {
            return { ...node, hidden: isExpanded };
          }

          // Deeper descendants: hide when collapsing, keep their own state when expanding
          if (isExpanded && allDescendants.includes(node.id)) {
            return { ...node, hidden: true };
          }

          return node;
        })
      );

      // Update edge visibility — hide edges that connect to hidden descendants
      setEdges((edges) =>
        edges.map((edge) => {
          const sourceIsDescendant = allDescendants.includes(edge.source);
          const targetIsDescendant = allDescendants.includes(edge.target);
          const connectsToChild =
            edge.source === nodeId ||
            edge.target === nodeId ||
            sourceIsDescendant ||
            targetIsDescendant;

          if (!connectsToChild) return edge;

          // When collapsing: hide edges to all descendants
          if (isExpanded) return { ...edge, hidden: true };

          // When expanding: show edges to immediate children only
          const srcNode = getNodes().find((n) => n.id === edge.source);
          const tgtNode = getNodes().find((n) => n.id === edge.target);
          const isImmediateChildEdge =
            srcNode?.parentId === nodeId || tgtNode?.parentId === nodeId ||
            edge.source === nodeId || edge.target === nodeId;

          return { ...edge, hidden: !isImmediateChildEdge };
        })
      );

      // Commit expand state to store + trigger ELK re-layout
      toggleExpand(nodeId);
    },
    [expandedIds, getDescendants, setNodes, setEdges, toggleExpand, getNodes]
  );

  const isExpanded = useCallback(
    (nodeId: string) => expandedIds.has(nodeId),
    [expandedIds]
  );

  const expandAll = useCallback(() => {
    setNodes((nodes) => nodes.map((n) => ({ ...n, hidden: false })));
    setEdges((edges) => edges.map((e) => ({ ...e, hidden: false })));
    useGraphStore.getState().bumpLayout();
  }, [setNodes, setEdges]);

  const collapseAll = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((n) => ({
        ...n,
        hidden: !!n.parentId, // hide everything except top-level nodes
        data: { ...n.data, expanded: false },
      }))
    );
    setEdges((edges) =>
      edges.map((e) => ({
        ...e,
        hidden: !!(
          getNodes().find((n) => n.id === e.source)?.parentId ||
          getNodes().find((n) => n.id === e.target)?.parentId
        ),
      }))
    );
    useGraphStore.getState().bumpLayout();
  }, [setNodes, setEdges, getNodes]);

  return { toggle, isExpanded, expandAll, collapseAll };
}
