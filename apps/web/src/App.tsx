import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import FlowCanvas from "@/flow/FlowCanvas";
import { Toolbar } from "@/components/panels/Toolbar";
import { DetailPanel } from "@/components/panels/DetailPanel";
import { WebSocketService } from "@/services/WebSocketService";

export type ViewMode = "workflow" | "memory";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Initialise WebSocket service singleton on mount
  useEffect(() => {
    WebSocketService.getInstance();
    return () => {
      WebSocketService.getInstance().disconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Top toolbar */}
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        workflowId={workflowId}
        onWorkflowStart={setWorkflowId}
      />

      {/* Main canvas + detail panel */}
      <div className="flex flex-1 overflow-hidden">
        <ReactFlowProvider>
          <div className="flex-1 relative">
            <FlowCanvas viewMode={viewMode} />
          </div>
        </ReactFlowProvider>

        {/* Detail panel — collapsible side panel */}
        <DetailPanel />
      </div>
    </div>
  );
}
