// ToolCallEdge.tsx — Dashed amber edge for tool invocations (radial-friendly)

import { memo } from "react";
import { BaseEdge, type EdgeProps } from "@xyflow/react";

function radialArc(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const curvature = Math.min(dist * 0.2, 40);
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const cx = (sx + tx) / 2 + nx * curvature;
  const cy = (sy + ty) / 2 + ny * curvature;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}

export const ToolCallEdge = memo((props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY } = props;
  const path = radialArc(sourceX, sourceY, targetX, targetY);
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: "#d97706", strokeWidth: 1.5, strokeDasharray: "4 3" }}
      markerEnd="url(#arrowhead)"
    />
  );
});
ToolCallEdge.displayName = "ToolCallEdge";
