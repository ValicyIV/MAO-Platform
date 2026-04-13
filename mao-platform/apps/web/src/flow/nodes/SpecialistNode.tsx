// SpecialistNode.tsx — Minimal workflow bubble for specialist agents.
// The canvas stays high-level: agent name + delegated topic only.

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useAgentStatusStore } from "@/stores/agentStatusStore";
import { AgentStatus } from "@mao/shared-types";
import type { SpecialistNodeData } from "@mao/shared-types";

export const SpecialistNode = memo(({ data }: NodeProps<Node<SpecialistNodeData>>) => {
  const liveStatus = useAgentStatusStore((s) => s.statuses[data.agentId]);
  const status = liveStatus?.status ?? data.status;
  const topic = data.currentTopic?.trim() || "Waiting for topic";

  const borderColor =
    status === AgentStatus.Running || status === AgentStatus.Thinking
      ? "border-blue-500/60 shadow-blue-500/20"
      : status === AgentStatus.Error
      ? "border-red-500/50 shadow-red-500/15"
      : status === AgentStatus.Complete
      ? "border-emerald-500/40 shadow-emerald-500/15"
      : "border-neutral-700 shadow-neutral-900";

  const dotColor =
    status === AgentStatus.Running || status === AgentStatus.Thinking
      ? "bg-blue-400"
      : status === AgentStatus.Error
      ? "bg-red-400"
      : status === AgentStatus.Complete
      ? "bg-emerald-400"
      : "bg-neutral-500";

  return (
    <div
      className={[
        "specialist-node w-56 rounded-[1.6rem] border-2 bg-neutral-900 shadow-lg transition-all",
        "px-4 py-3",
        borderColor,
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        <span className="font-semibold text-sm text-neutral-100 leading-tight">
          {data.agentName}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-neutral-400 line-clamp-4">
        {topic}
      </p>

      <Handle type="target" position={Position.Top} id="tgt-top" className="opacity-0" />
      <Handle type="target" position={Position.Right} id="tgt-right" className="opacity-0" />
      <Handle type="target" position={Position.Bottom} id="tgt-bottom" className="opacity-0" />
      <Handle type="target" position={Position.Left} id="tgt-left" className="opacity-0" />
      <Handle type="source" position={Position.Top} id="src-top" className="opacity-0" />
      <Handle type="source" position={Position.Right} id="src-right" className="opacity-0" />
      <Handle type="source" position={Position.Bottom} id="src-bottom" className="opacity-0" />
      <Handle type="source" position={Position.Left} id="src-left" className="opacity-0" />
    </div>
  );
});

SpecialistNode.displayName = "SpecialistNode";
