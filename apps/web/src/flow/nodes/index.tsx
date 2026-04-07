// OrchestratorNode.tsx — Level 1: Root orchestrator compound node

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";
import { useIsExpanded } from "@/stores/selectors/graphSelectors";
import type { OrchestratorNodeData } from "@mao/shared-types";
import { AgentStatus } from "@mao/shared-types";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const OrchestratorNode = memo(({ id, data }: NodeProps<OrchestratorNodeData>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);

  return (
    <div className="orchestrator-node min-w-72 rounded-xl border border-neutral-600 bg-neutral-800 shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                data.status === AgentStatus.Running
                  ? "bg-blue-400 animate-pulse"
                  : data.status === AgentStatus.Complete
                  ? "bg-emerald-400"
                  : "bg-neutral-500"
              }`}
            />
            <span className="font-semibold text-sm text-neutral-100">{data.workflowName}</span>
          </div>
          <button
            className="nodrag text-neutral-400 hover:text-neutral-100 transition-colors text-xs px-2 py-1 rounded border border-neutral-600 hover:border-neutral-400"
            onClick={() => toggleExpand(id)}
          >
            {isExpanded ? "−" : "+"} {data.agentCount} agents
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
          <StatusBadge status={data.status} />
          <span>{data.totalTokens.toLocaleString()} tokens</span>
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
});
OrchestratorNode.displayName = "OrchestratorNode";


// ──────────────────────────────────────────────────────────────────────────────


// SpecialistNode.tsx — Level 2: Per-agent node

import type { SpecialistNodeData } from "@mao/shared-types";

export const SpecialistNode = memo(({ id, data }: NodeProps<SpecialistNodeData>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);
  // Subscribe to status store for this specific agent only
  const { useAgentStatus } = require("@/hooks");
  const liveStatus = useAgentStatus(data.agentId);
  const status = liveStatus?.status ?? data.status;

  const MODEL_COLORS: Record<string, string> = {
    "claude-opus-4-6":   "bg-violet-500/20 text-violet-300 border-violet-500/30",
    "claude-sonnet-4-6": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "claude-haiku-4-5":  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  };
  const modelColor = MODEL_COLORS[data.model] ?? "bg-neutral-700 text-neutral-300";

  return (
    <div className="specialist-node min-w-64 rounded-lg border border-neutral-700 bg-neutral-850 shadow-md">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={status} size="sm" />
            <span className="font-medium text-sm text-neutral-200 truncate">{data.agentName}</span>
          </div>
          <button
            className="nodrag shrink-0 text-neutral-500 hover:text-neutral-200 text-xs"
            onClick={() => toggleExpand(id)}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${modelColor}`}>
            {data.model.split("-").slice(1, 3).join("-")}
          </span>
          {data.tools.slice(0, 3).map((tool) => (
            <span key={tool} className="text-xs px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400 border border-neutral-600">
              {tool.replace(/_tool$/, "")}
            </span>
          ))}
          {data.tools.length > 3 && (
            <span className="text-xs text-neutral-500">+{data.tools.length - 3}</span>
          )}
        </div>

        {data.currentStep && (
          <p className="mt-1.5 text-xs text-neutral-500 truncate">↳ {data.currentStep}</p>
        )}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
SpecialistNode.displayName = "SpecialistNode";


// ──────────────────────────────────────────────────────────────────────────────


// ExecutionStepNode.tsx — Level 3: Execution step / tool call node

import type { ExecutionStepNodeData, ToolCallNodeData } from "@mao/shared-types";

const STEP_ICONS: Record<string, string> = {
  llm_call: "🧠",
  tool_use: "🔧",
  decision: "⚡",
  handoff: "→",
  verification: "✓",
};

export const ExecutionStepNode = memo(({ id, data }: NodeProps<ExecutionStepNodeData | ToolCallNodeData>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);
  const stepType = data.stepType ?? "llm_call";

  const toolData = "toolName" in data ? data as ToolCallNodeData : null;
  const stepData = !toolData ? data as ExecutionStepNodeData : null;

  return (
    <div className="execution-step-node min-w-56 rounded-md border border-neutral-700 bg-neutral-900">
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">{STEP_ICONS[stepType] ?? "●"}</span>
            <span className="text-xs font-medium text-neutral-300 truncate">
              {toolData?.toolName ?? stepData?.stepName ?? stepType}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {data.durationMs != null && (
              <span className="text-xs text-neutral-500">{data.durationMs}ms</span>
            )}
            {("hasThinking" in data && data.hasThinking) && (
              <button
                className="nodrag text-neutral-500 hover:text-violet-400 text-xs"
                onClick={() => toggleExpand(id)}
              >
                {isExpanded ? "▲" : "▼"}
              </button>
            )}
          </div>
        </div>

        {toolData?.toolResult && (
          <p className="mt-1.5 text-xs text-neutral-500 truncate">
            ← {toolData.toolResult.slice(0, 80)}
          </p>
        )}
        {stepData?.outputPreview && (
          <p className="mt-1.5 text-xs text-neutral-500 truncate">
            {stepData.outputPreview.slice(0, 80)}
          </p>
        )}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
ExecutionStepNode.displayName = "ExecutionStepNode";


// ──────────────────────────────────────────────────────────────────────────────


// GroupContainerNode.tsx — Handle-less parent container for compound nesting

export const GroupContainerNode = memo(({ id }: NodeProps) => (
  <div
    className="group-container-node w-full h-full rounded-xl border border-dashed border-neutral-700 bg-neutral-900/30"
    style={{ pointerEvents: "none" }}
  />
));
GroupContainerNode.displayName = "GroupContainerNode";
