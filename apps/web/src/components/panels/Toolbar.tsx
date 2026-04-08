// Toolbar.tsx — Top bar: view toggle, workflow controls, status indicators

import { useState } from "react";
import type { ViewMode } from "@/App";
import { useAgentConnection } from "@/hooks";
import { AgentConfigPanel } from "@/components/panels/AgentConfigPanel";
import { useActiveStreamCount } from "@/stores/selectors/streamingSelectors";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { useGraphStore } from "@/stores/graphStore";

interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  workflowId: string | null;
  onWorkflowStart: (id: string) => void;
}

export function Toolbar({ viewMode, onViewModeChange, workflowId, onWorkflowStart }: ToolbarProps) {
  const [task, setTask] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const { connect } = useAgentConnection();
  const activeStreams = useActiveStreamCount();
  const conflictCount = useMemoryGraphStore((s) => s.conflictCount);
  const resetGraph = useGraphStore((s) => s.reset);

  const handleRun = () => {
    if (!task.trim()) return;
    const id = `wf-${Date.now().toString(36)}`;
    onWorkflowStart(id);
    connect(id, task);
  };

  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-neutral-800 bg-neutral-950 shrink-0">
      {/* Brand */}
      <span className="font-semibold text-sm text-neutral-300 mr-2">MAO</span>

      {/* View mode toggle */}
      <div className="flex rounded-md border border-neutral-700 overflow-hidden text-xs">
        <button
          onClick={() => onViewModeChange("workflow")}
          className={`px-3 py-1.5 transition-colors ${
            viewMode === "workflow" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Workflow
        </button>
        <button
          onClick={() => {
            onViewModeChange("memory");
            useMemoryGraphStore.getState().fetchGraph();
          }}
          className={`px-3 py-1.5 transition-colors ${
            viewMode === "memory" ? "bg-violet-600 text-white" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Memory
          {conflictCount > 0 && (
            <span className="ml-1.5 bg-amber-500 text-white text-xs px-1 rounded-full">
              {conflictCount}
            </span>
          )}
        </button>
      </div>

      {/* Task input */}
      <input
        type="text"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleRun()}
        placeholder="Describe a task for the agents..."
        className="flex-1 max-w-xl text-sm bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
      />

      {/* Config button */}
      <button
        onClick={() => setShowConfig(true)}
        className="px-3 py-1.5 rounded-md text-sm border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition-colors"
        title="Configure agent models"
      >
        ⚙ Agents
      </button>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!task.trim()}
        className="px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white transition-colors"
      >
        Run
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status indicators */}
      {activeStreams > 0 && (
        <span className="text-xs text-blue-400 animate-pulse">
          {activeStreams} streaming
        </span>
      )}

      {workflowId && (
        <span className="text-xs text-neutral-600 font-mono">{workflowId}</span>
      )}

      {/* Reset */}
      <button
        onClick={() => { resetGraph(); setTask(""); }}
        className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
      >
        Clear
      </button>
      {/* Agent config panel */}
      {showConfig && (
        <AgentConfigPanel onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}
