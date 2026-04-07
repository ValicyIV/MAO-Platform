// HandoffEdge.tsx — Teal curved edge for agent-to-agent handoffs

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export const HandoffEdge = memo((props: EdgeProps) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: "#2dd4bf", strokeWidth: 2 }}
      markerStart="url(#arrowhead)"
      markerEnd="url(#arrowhead)"
    />
  );
});
HandoffEdge.displayName = "HandoffEdge";
