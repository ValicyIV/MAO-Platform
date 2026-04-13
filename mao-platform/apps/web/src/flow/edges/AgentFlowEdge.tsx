// AgentFlowEdge.tsx — Animated delegation edge (radial-friendly curved path)

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";

/**
 * Build a smooth quadratic bezier that curves outward from center.
 * Works well with radial layouts where source/target can be at any angle.
 */
function radialBezierPath(
  sx: number, sy: number,
  tx: number, ty: number,
): [string, number, number] {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular offset scales with distance — creates gentle arc
  const curvature = Math.min(dist * 0.25, 60);
  // Normal vector (perpendicular)
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = (sx + tx) / 2 + nx * curvature;
  const cy = (sy + ty) / 2 + ny * curvature;
  const labelX = (sx + 2 * cx + tx) / 4;
  const labelY = (sy + 2 * cy + ty) / 4;
  return [`M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`, labelX, labelY];
}

export const AgentFlowEdge = memo((props: EdgeProps) => {
  const {
    id, sourceX, sourceY, targetX, targetY,
    animated, data,
  } = props;

  const [path, labelX, labelY] = radialBezierPath(sourceX, sourceY, targetX, targetY);

  const stroke     = animated ? "#60a5fa" : "#3f3f46";
  const strokeWidth = animated ? 2 : 1.5;
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
            className="absolute pointer-events-none text-[10px] text-neutral-500 bg-neutral-950/80 px-1.5 py-0.5 rounded-full"
          >
            {String((data as Record<string, unknown>).label)}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
AgentFlowEdge.displayName = "AgentFlowEdge";
