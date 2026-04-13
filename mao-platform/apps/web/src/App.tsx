import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import FlowCanvas from "@/flow/FlowCanvas";
import { Toolbar } from "@/components/panels/Toolbar";
import { DetailPanel } from "@/components/panels/DetailPanel";
import { WorkflowSidePanel } from "@/components/panels/WorkflowSidePanel";
import { ConversationTreePanel } from "@/components/panels/ConversationTreePanel";

export type ViewMode = "workflow" | "memory" | "conversation";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {import.meta.env.DEV && (
        <p className="shrink-0 px-4 py-1 text-[11px] text-neutral-600 border-b border-neutral-800/60 bg-neutral-950 font-mono">
          Dev: full MAO = this UI + API (LangGraph, WebSocket). Start Postgres/API per README; then Run. UI still paints if the API is down.
        </p>
      )}
      {/* Top toolbar */}
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        workflowId={workflowId}
        onWorkflowStart={setWorkflowId}
      />

      {/* Main canvas + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === "conversation" ? (
          /* Hierarchical conversation tree — Agent → Topic → Messages → Tools/Thinking */
          <ConversationTreePanel />
        ) : (
          /* React Flow graph canvas (workflow or memory) */
          <ReactFlowProvider key={viewMode}>
            <div className="flex-1 relative">
              <FlowCanvas viewMode={viewMode} />
            </div>
          </ReactFlowProvider>
        )}

        {/* Right panel: workflow gets thread+details, memory gets detail panel only */}
        {viewMode === "workflow" && <WorkflowSidePanel />}
        {viewMode === "memory" && <DetailPanel />}
      </div>
    </div>
  );
}
