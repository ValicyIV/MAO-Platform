// ExecutionStepNode.tsx — Level 3: Execution step / tool call node

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useGraphStore } from "@/stores/graphStore";
import { useIsExpanded } from "@/stores/selectors/graphSelectors";
import type { ExecutionStepNodeData, ToolCallNodeData } from "@mao/shared-types";
import { StepType } from "@mao/shared-types";

const STEP_ICONS: Partial<Record<StepType, string>> = {
  [StepType.LLMCall]:      "🧠",
  [StepType.ToolUse]:      "🔧",
  [StepType.Decision]:     "⚡",
  [StepType.Handoff]:      "→",
  [StepType.Verification]: "✓",
};

const STATUS_COLORS = {
  pending: "text-neutral-500",
  running: "text-blue-400",
  success: "text-emerald-400",
  error:   "text-red-400",
};

type StepNodeData = ExecutionStepNodeData | ToolCallNodeData;

export const ExecutionStepNode = memo(({ id, data }: NodeProps<Node<StepNodeData>>) => {
  const isExpanded = useIsExpanded(id);
  const toggleExpand = useGraphStore((s) => s.toggleExpand);

  const isToolCall = "toolName" in data;
  const toolData   = isToolCall ? (data as ToolCallNodeData)      : null;
  const stepData   = !isToolCall ? (data as ExecutionStepNodeData) : null;

  const icon    = STEP_ICONS[data.stepType] ?? "●";
  const title   = toolData?.toolName ?? stepData?.stepName ?? data.stepType;
  const preview = toolData?.toolResult?.slice(0, 80) ?? stepData?.outputPreview?.slice(0, 80);
  const hasChildren = stepData?.hasThinking || false;
  const toolStatus  = toolData?.status ?? "success";

  return (
    <div className="execution-step-node min-w-52 rounded-md border border-neutral-700 bg-neutral-900/80 shadow-sm">
      <div className="px-3 py-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">{icon}</span>
            <span
              className={[
                "text-xs font-medium truncate",
                isToolCall ? STATUS_COLORS[toolStatus] : "text-neutral-300",
              ].join(" ")}
            >
              {title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {data.durationMs != null && (
              <span className="text-xs text-neutral-600 tabular-nums">{data.durationMs}ms</span>
            )}
            {hasChildren && (
              <button
                className="nodrag text-neutral-600 hover:text-violet-400 transition-colors text-xs"
                onClick={() => toggleExpand(id)}
              >
                {isExpanded ? "▲" : "▼"}
              </button>
            )}
          </div>
        </div>

        {/* Output preview */}
        {preview && (
          <p className="mt-1.5 text-xs text-neutral-500 truncate">
            {isToolCall ? "←" : "→"} {preview}
          </p>
        )}

        {/* Tool args preview */}
        {toolData?.toolArgs && Object.keys(toolData.toolArgs).length > 0 && (
          <p className="mt-1 text-xs text-neutral-600 font-mono truncate">
            {JSON.stringify(toolData.toolArgs).slice(0, 60)}
          </p>
        )}
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});
ExecutionStepNode.displayName = "ExecutionStepNode";
