// hooks/useAutoLayout.ts — ELK compound graph layout
// Runs on layoutVersion changes. Debounced 50ms to batch rapid updates.
// Only re-layouts on topology changes, NOT on streaming text updates.

import { useEffect, useRef } from "react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useGraphStore } from "@/stores/graphStore";

const elk = new ELK();

const ELK_OPTIONS: Record<string, string> = {
  "elk.algorithm":                  "radial",
  "elk.radial.centerOnRoot":        "true",
  "elk.radial.orderId":             "1",
  "elk.radial.compactor":           "WEDGE_COMPACTION",
  "elk.spacing.nodeNode":           "60",
  "elk.padding":                    "[top=60, left=60, bottom=60, right=60]",
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
        // Radial layout: flat graph — all nodes at top level, edges define ring distance
        const elkGraph: ElkNode = {
          id: "root",
          layoutOptions: ELK_OPTIONS,
          children: visibleNodes.map((n) => ({
            id: n.id,
            width: n.width ?? 176,
            height: n.height ?? 120,
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
            const found = layout.children?.find((c) => c.id === node.id);
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
