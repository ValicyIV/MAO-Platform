// AgentFlowEdge.tsx — Animated delegation edge (pulses when active)

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export const AgentFlowEdge = memo((props: EdgeProps) => {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    animated, data,
  } = props;

  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const stroke     = animated ? "#60a5fa" : "#3f3f46";
  const strokeWidth = animated ? 2 : 1;
  const dashArray  = animated ? "6 3" : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke, strokeWidth, strokeDasharray: dashArray }}
        markerEnd="url(#arrowhead)"
      />
      {(data as Record<string, unknown>)?.label && (
        <EdgeLabelRenderer>
          <span
            style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute pointer-events-none text-xs text-neutral-500 bg-neutral-950/80 px-1 rounded"
          >
            {String((data as Record<string, unknown>).label)}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
AgentFlowEdge.displayName = "AgentFlowEdge";
