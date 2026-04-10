// EntityNode.tsx — Memory graph entity node (Pattern 16)
// Color-coded by entity type. Temporal mode fades old facts.

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { MemoryEntityType } from "@mao/shared-types";
import type { MemoryNodeData } from "@mao/shared-types";

const TYPE_STYLES: Record<MemoryEntityType, { border: string; bg: string; dot: string; label: string }> = {
  [MemoryEntityType.Agent]:     { border: "border-blue-500/40",   bg: "bg-blue-500/10",   dot: "bg-blue-400",   label: "Agent" },
  [MemoryEntityType.Task]:      { border: "border-teal-500/40",   bg: "bg-teal-500/10",   dot: "bg-teal-400",   label: "Task" },
  [MemoryEntityType.Fact]:      { border: "border-violet-500/40", bg: "bg-violet-500/10", dot: "bg-violet-400", label: "Fact" },
  [MemoryEntityType.Decision]:  { border: "border-amber-500/40",  bg: "bg-amber-500/10",  dot: "bg-amber-400",  label: "Decision" },
  [MemoryEntityType.Output]:    { border: "border-emerald-500/40",bg: "bg-emerald-500/10",dot: "bg-emerald-400",label: "Output" },
  [MemoryEntityType.Concept]:   { border: "border-neutral-500/40",bg: "bg-neutral-800",   dot: "bg-neutral-400",label: "Concept" },
  [MemoryEntityType.Person]:    { border: "border-pink-500/40",   bg: "bg-pink-500/10",   dot: "bg-pink-400",   label: "Person" },
  [MemoryEntityType.Procedure]: { border: "border-orange-500/40", bg: "bg-orange-500/10", dot: "bg-orange-400", label: "Procedure" },
};

export const EntityNode = memo(({ id, data }: NodeProps<Node<MemoryNodeData>>) => {
  const showTemporal = useMemoryGraphStore((s) => s.showTemporal);
  const highlighted = useMemoryGraphStore((s) => s.highlightedEntityId);
  const style = TYPE_STYLES[data.entityType] ?? TYPE_STYLES[MemoryEntityType.Concept]!;

  const isHighlighted = highlighted === id;
  const isOld = showTemporal && Date.now() - data.updatedAt > 7 * 24 * 60 * 60 * 1000;
  const opacity = isOld ? "opacity-40" : "opacity-100";
  const ring = isHighlighted ? "ring-2 ring-white/30" : "";

  return (
    <div
      className={`entity-node min-w-44 max-w-64 rounded-lg border ${style.border} ${style.bg} ${opacity} ${ring} transition-opacity`}
    >
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
          <span className="text-xs text-neutral-500">{style.label}</span>
          <span className="ml-auto text-xs text-neutral-600">
            {Math.round(data.confidence * 100)}%
          </span>
        </div>
        <p className="text-sm font-medium text-neutral-200 truncate">{data.label}</p>
        {data.summary && (
          <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{data.summary}</p>
        )}
        {data.isContradicted && (
          <p className="mt-1.5 text-xs text-red-400 line-through opacity-70">{data.label}</p>
        )}
      </div>
      <Handle type="target" position={Position.Top}  className="!w-1.5 !h-1.5 !bg-neutral-600" />
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-neutral-600" />
    </div>
  );
});
EntityNode.displayName = "EntityNode";
