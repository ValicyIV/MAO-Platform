// edges/AgentFlowEdge.tsx — Animated delegation edge

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export const AgentFlowEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, animated,
}: EdgeProps) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: animated ? "#60a5fa" : "#525252",
          strokeWidth: animated ? 2 : 1,
          strokeDasharray: animated ? "6 3" : undefined,
        }}
        markerEnd="url(#arrowhead)"
      />
      {(data as any)?.label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute text-xs text-neutral-500 bg-neutral-900 px-1 rounded pointer-events-none"
          >
            {(data as any).label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
AgentFlowEdge.displayName = "AgentFlowEdge";


// ──────────────────────────────────────────────────────────────────────────────

// edges/ToolCallEdge.tsx — Dashed tool invocation edge

import { BaseEdge as BaseEdge2, getBezierPath as getBezierPath2, type EdgeProps as EdgeProps2 } from "@xyflow/react";

export const ToolCallEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
}: EdgeProps2) => {
  const [path] = getBezierPath2({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge2
      id={id}
      path={path}
      style={{ stroke: "#d97706", strokeWidth: 1, strokeDasharray: "4 2" }}
      markerEnd="url(#arrowhead)"
    />
  );
});
ToolCallEdge.displayName = "ToolCallEdge";


// ──────────────────────────────────────────────────────────────────────────────

// edges/HandoffEdge.tsx — Curved agent handoff edge

import { BaseEdge as BaseEdge3, getBezierPath as getBezierPath3, type EdgeProps as EdgeProps3 } from "@xyflow/react";

export const HandoffEdge = memo(({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
}: EdgeProps3) => {
  const [path] = getBezierPath3({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge3
      id={id}
      path={path}
      style={{ stroke: "#2dd4bf", strokeWidth: 2 }}
      markerStart="url(#arrowhead)"
      markerEnd="url(#arrowhead)"
    />
  );
});
HandoffEdge.displayName = "HandoffEdge";
