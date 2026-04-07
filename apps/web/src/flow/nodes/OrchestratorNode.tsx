// OrchestratorNode.tsx — Level 1: Root orchestrator compound node

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";
import { useIsExpanded } from "@/stores/selectors/graphSelectors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentStatus } from "@mao/shared-types";
import type { OrchestratorNodeData } from "@mao/shared-types";

export const OrchestratorNode = memo(({ id, data }: NodeProps<OrchestratorNodeData>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);

  return (
    <div className="orchestrator-node min-w-72 rounded-xl border border-neutral-600 bg-neutral-800 shadow-lg">
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={[
                "w-3 h-3 rounded-full",
                data.status === AgentStatus.Running ? "bg-blue-400 animate-pulse" :
                data.status === AgentStatus.Complete ? "bg-emerald-400" :
                "bg-neutral-500",
              ].join(" ")}
            />
            <span className="font-semibold text-sm text-neutral-100 truncate max-w-40">
              {data.workflowName}
            </span>
          </div>

          {/* Expand toggle */}
          <button
            className="nodrag text-neutral-400 hover:text-neutral-100 transition-colors
                       text-xs px-2 py-1 rounded border border-neutral-600 hover:border-neutral-400 shrink-0"
            onClick={() => toggleExpand(id)}
          >
            {isExpanded ? "▲ collapse" : `▼ ${data.agentCount} agents`}
          </button>
        </div>

        {/* Status row */}
        <div className="mt-2 flex items-center gap-3">
          <StatusBadge status={data.status} />
          <span className="text-xs text-neutral-500">
            {data.totalTokens.toLocaleString()} tokens
          </span>
          {data.startedAt && (
            <span className="text-xs text-neutral-600 ml-auto">
              {Math.round((Date.now() - data.startedAt) / 1000)}s
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
});
OrchestratorNode.displayName = "OrchestratorNode";
