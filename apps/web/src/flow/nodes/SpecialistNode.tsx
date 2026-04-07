// SpecialistNode.tsx — Level 2: Per-agent specialist node

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";
import { useIsExpanded } from "@/stores/selectors/graphSelectors";
import { useAgentStatusStore } from "@/stores/agentStatusStore";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgentStatus } from "@mao/shared-types";
import type { SpecialistNodeData } from "@mao/shared-types";

const MODEL_BADGES: Record<string, string> = {
  "claude-opus-4-6":   "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "claude-sonnet-4-6": "bg-blue-500/20   text-blue-300   border-blue-500/30",
  "claude-haiku-4-5":  "bg-teal-500/20   text-teal-300   border-teal-500/30",
};

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6":   "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5":  "Haiku",
};

export const SpecialistNode = memo(({ id, data }: NodeProps<SpecialistNodeData>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);

  // Subscribe to live status for this specific agent only — isolated selector
  const liveStatus = useAgentStatusStore((s) => s.statuses[data.agentId]);
  const status = liveStatus?.status ?? data.status;
  const currentStep = liveStatus?.currentStep ?? data.currentStep;
  const tokenCount = liveStatus?.tokenCount ?? data.tokenCount;

  const modelBadge = MODEL_BADGES[data.model] ?? "bg-neutral-700 text-neutral-300 border-neutral-600";
  const modelLabel = MODEL_LABELS[data.model] ?? data.model.split("-")[1] ?? data.model;

  return (
    <div
      className={[
        "specialist-node min-w-60 rounded-lg border bg-neutral-900 shadow-md transition-colors",
        status === AgentStatus.Running || status === AgentStatus.Thinking
          ? "border-blue-500/50"
          : status === AgentStatus.Error
          ? "border-red-500/50"
          : status === AgentStatus.Complete
          ? "border-emerald-500/30"
          : "border-neutral-700",
      ].join(" ")}
    >
      <div className="px-3 py-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={status} size="sm" />
            <span className="font-medium text-sm text-neutral-200 truncate">{data.agentName}</span>
          </div>
          <button
            className="nodrag shrink-0 text-neutral-500 hover:text-neutral-200 transition-colors text-xs"
            onClick={() => toggleExpand(id)}
            title={isExpanded ? "Collapse steps" : "Expand steps"}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>

        {/* Badges row */}
        <div className="mt-2 flex flex-wrap gap-1 items-center">
          <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${modelBadge}`}>
            {modelLabel}
          </span>
          {data.tools.slice(0, 3).map((tool) => (
            <span
              key={tool}
              className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700"
            >
              {tool.replace(/_tool$/, "").replace(/_/g, " ")}
            </span>
          ))}
          {data.tools.length > 3 && (
            <span className="text-xs text-neutral-600">+{data.tools.length - 3}</span>
          )}
        </div>

        {/* Current step + token count */}
        <div className="mt-2 flex items-center justify-between gap-2">
          {currentStep ? (
            <p className="text-xs text-neutral-500 truncate flex-1">↳ {currentStep}</p>
          ) : (
            <span />
          )}
          {tokenCount > 0 && (
            <span className="text-xs text-neutral-600 shrink-0 tabular-nums">
              {tokenCount.toLocaleString()} tok
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
SpecialistNode.displayName = "SpecialistNode";
