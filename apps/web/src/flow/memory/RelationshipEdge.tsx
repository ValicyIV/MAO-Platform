// RelationshipEdge.tsx — Memory graph relationship edge
// Thickness proportional to confidence. Red for contradictions.

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { MemoryEdgeData } from "@mao/shared-types";

const RELATIONSHIP_COLORS: Record<string, string> = {
  contradicts:    "#ef4444",
  derived_from:   "#2dd4bf",
  depends_on:     "#f59e0b",
  contributed_to: "#60a5fa",
  knows_about:    "#a78bfa",
  produced:       "#34d399",
  resolved_by:    "#6ee7b7",
  worked_on:      "#93c5fd",
  learned:        "#c4b5fd",
};

export const RelationshipEdge = memo(({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<MemoryEdgeData>) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const rel = data?.relationship ?? "knows_about";
  const confidence = data?.confidence ?? 1;
  const color = RELATIONSHIP_COLORS[rel] ?? "#525252";
  const strokeWidth = Math.max(1, confidence * 2.5);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: color, strokeWidth, opacity: 0.7 }}
        markerEnd="url(#arrowhead)"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "none",
          }}
          className="absolute text-xs px-1 rounded bg-neutral-950/80"
          style={{
            color,
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "none",
          }}
        >
          {rel.replace(/_/g, " ")}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
RelationshipEdge.displayName = "RelationshipEdge";
