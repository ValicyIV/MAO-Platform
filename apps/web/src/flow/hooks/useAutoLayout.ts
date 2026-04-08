// hooks/useAutoLayout.ts — ELK compound graph layout
// Runs on layoutVersion changes. Debounced 50ms to batch rapid updates.
// Only re-layouts on topology changes, NOT on streaming text updates.
//
// IMPORTANT: Updates positions directly in the graphStore instead of using
// useReactFlow().setNodes to avoid an infinite re-render loop.
// setNodes triggers onNodesChange → graphStore update → new array ref → re-render → loop.

import { useEffect, useRef } from "react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useGraphStore } from "@/stores/graphStore";

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "30",
  "elk.padding": "[top=40, left=24, bottom=24, right=24]",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

export function useAutoLayout(layoutVersion: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce to batch multiple rapid layout triggers
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const { nodes, edges } = useGraphStore.getState();
      const visibleNodes = nodes.filter((n) => !n.hidden);
      const visibleEdges = edges.filter((e) => !e.hidden);

      if (visibleNodes.length === 0) return;

      try {
        const elkGraph: ElkNode = {
          id: "root",
          layoutOptions: ELK_OPTIONS,
          children: visibleNodes
            .filter((n) => !n.parentId) // top-level only — ELK handles children
            .map((n) => ({
              id: n.id,
              width: n.width ?? 320,
              height: n.height ?? 80,
              children: visibleNodes
                .filter((child) => child.parentId === n.id)
                .map((child) => ({
                  id: child.id,
                  width: child.width ?? 320,
                  height: child.height ?? 80,
                })),
            })),
          edges: visibleEdges.map((e) => ({
            id: e.id,
            sources: [e.source],
            targets: [e.target],
          })),
        };

        const layout = await elk.layout(elkGraph);

        // Build a position map from the ELK result
        const positionMap = new Map<string, { x: number; y: number; width?: number; height?: number }>();
        for (const child of layout.children ?? []) {
          if (child.x !== undefined && child.y !== undefined) {
            positionMap.set(child.id, { x: child.x, y: child.y, width: child.width, height: child.height });
          }
          for (const grandchild of child.children ?? []) {
            if (grandchild.x !== undefined && grandchild.y !== undefined) {
              positionMap.set(grandchild.id, { x: grandchild.x, y: grandchild.y, width: grandchild.width, height: grandchild.height });
            }
          }
        }

        // Apply positions directly to graphStore — avoids the
        // setNodes → onNodesChange → store update → re-render loop.
        if (positionMap.size > 0) {
          useGraphStore.setState((state) => ({
            nodes: state.nodes.map((node) => {
              const pos = positionMap.get(node.id);
              if (pos) {
                return {
                  ...node,
                  position: { x: pos.x, y: pos.y },
                  ...(pos.width != null || pos.height != null
                    ? { style: { ...node.style, width: pos.width, height: pos.height } }
                    : {}),
                };
              }
              return node;
            }),
          }));
        }
      } catch (e) {
        console.warn("[ELK] layout failed:", e);
      }
    }, 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [layoutVersion]);
}
