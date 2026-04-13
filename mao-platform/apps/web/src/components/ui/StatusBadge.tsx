// StatusBadge.tsx — Animated status indicator

import { AgentStatus } from "@mao/shared-types";

interface StatusBadgeProps {
  status: AgentStatus;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<AgentStatus, { label: string; classes: string; dot: string }> = {
  [AgentStatus.Idle]:        { label: "idle",       classes: "text-neutral-400 border-neutral-600", dot: "bg-neutral-500" },
  [AgentStatus.Running]:     { label: "running",    classes: "text-blue-300 border-blue-500/40",    dot: "bg-blue-400 animate-pulse" },
  [AgentStatus.Thinking]:    { label: "thinking",   classes: "text-violet-300 border-violet-500/40",dot: "bg-violet-400 animate-pulse" },
  [AgentStatus.ToolCalling]: { label: "tool",       classes: "text-amber-300 border-amber-500/40",  dot: "bg-amber-400" },
  [AgentStatus.Waiting]:     { label: "waiting",    classes: "text-neutral-400 border-neutral-600", dot: "bg-neutral-400" },
  [AgentStatus.Complete]:    { label: "done",       classes: "text-emerald-300 border-emerald-500/40",dot: "bg-emerald-400" },
  [AgentStatus.Error]:       { label: "error",      classes: "text-red-300 border-red-500/40",       dot: "bg-red-400" },
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG[AgentStatus.Idle]!;
  return (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-xs ${cfg.classes}`}>
      <span className={`rounded-full ${cfg.dot} ${size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"}`} />
      {size !== "sm" && cfg.label}
    </span>
  );
}
