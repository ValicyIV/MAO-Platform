// OrchestratorNode.tsx — Level 1: Root orchestrator compound node

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";
import { useIsExpanded } from "@/stores/selectors/graphSelectors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentStatus } from "@mao/shared-types";
import type { OrchestratorNodeData } from "@mao/shared-types";

export const OrchestratorNode = memo(({ id, data }: NodeProps<Node<OrchestratorNodeData>>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);

  const ringColor =
    data.status === AgentStatus.Running ? "border-blue-500 shadow-blue-500/30" :
    data.status === AgentStatus.Complete ? "border-emerald-500 shadow-emerald-500/20" :
    "border-neutral-600 shadow-neutral-800";

  const pulseRing =
    data.status === AgentStatus.Running
      ? "after:absolute after:inset-[-6px] after:rounded-full after:border-2 after:border-blue-400/40 after:animate-ping"
      : "";

  return (
    <div
      className={[
        "orchestrator-node relative flex flex-col items-center justify-center",
        "w-40 h-40 rounded-full border-2 bg-neutral-800 shadow-xl transition-all",
        ringColor,
        pulseRing,
      ].join(" ")}
    >
      {/* Central status indicator */}
      <div
        className={[
          "w-4 h-4 rounded-full mb-1.5",
          data.status === AgentStatus.Running ? "bg-blue-400 animate-pulse" :
          data.status === AgentStatus.Complete ? "bg-emerald-400" :
          "bg-neutral-500",
        ].join(" ")}
      />

      {/* Workflow name */}
      <span className="font-semibold text-xs text-neutral-100 text-center truncate max-w-28 px-2">
        {data.workflowName}
      </span>

      {/* Status + tokens */}
      <div className="mt-1 flex items-center gap-1.5">
        <StatusBadge status={data.status} size="sm" />
        <span className="text-[10px] text-neutral-500 tabular-nums">
          {data.totalTokens.toLocaleString()} tok
        </span>
      </div>

      {/* Expand toggle */}
      <button
        className="nodrag mt-1.5 text-neutral-500 hover:text-neutral-200 transition-colors
                   text-[10px] px-1.5 py-0.5 rounded-full border border-neutral-600 hover:border-neutral-400"
        onClick={() => toggleExpand(id)}
      >
        {isExpanded ? "collapse" : `${data.agentCount} agents`}
      </button>

      {/* Omnidirectional handles for radial edges */}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="opacity-0" />
    </div>
  );
});
OrchestratorNode.displayName = "OrchestratorNode";
