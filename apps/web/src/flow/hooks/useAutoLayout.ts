// hooks/useAutoLayout.ts — ELK compound graph layout
// Runs on layoutVersion changes. Debounced 50ms to batch rapid updates.
// Only re-layouts on topology changes, NOT on streaming text updates.

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
        const positionedNodes = Object.fromEntries(
          visibleNodes.map((node) => {
            const found =
              layout.children?.find((c) => c.id === node.id) ??
              layout.children
                ?.flatMap((c) => c.children ?? [])
                .find((c) => c.id === node.id);

            return [
              node.id,
              {
                x: found?.x ?? node.position.x,
                y: found?.y ?? node.position.y,
                ...(found?.width !== undefined ? { width: found.width } : {}),
                ...(found?.height !== undefined ? { height: found.height } : {}),
              },
            ];
          })
        );

        useGraphStore.getState().applyLayout(positionedNodes);
      } catch (e) {
        console.warn("[ELK] layout failed:", e);
      }
    }, 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [layoutVersion]);
}
