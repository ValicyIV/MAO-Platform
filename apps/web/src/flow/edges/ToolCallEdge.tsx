// ToolCallEdge.tsx — Dashed amber edge for tool invocations

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export const ToolCallEdge = memo((props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
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
