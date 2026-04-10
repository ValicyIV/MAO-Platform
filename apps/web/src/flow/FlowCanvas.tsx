// FlowCanvas.tsx — ⚡ DRIVER: React Flow graph wrapper.
// Wires nodeTypes, edgeTypes, graphStore, and ELK layout.
// Switches between workflow graph and memory graph based on viewMode.

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useGraphStore } from "@/stores/graphStore";
import { useVisibleNodes, useVisibleEdges } from "@/stores/selectors/graphSelectors";
import { useAutoLayout } from "./hooks/useAutoLayout";

import { OrchestratorNode } from "./nodes/OrchestratorNode";
import { SpecialistNode } from "./nodes/SpecialistNode";
import { ExecutionStepNode } from "./nodes/ExecutionStepNode";
import { ThinkingStreamNode } from "./nodes/ThinkingStreamNode";
import { GroupContainerNode } from "./nodes/GroupContainerNode";
import { AgentFlowEdge } from "./edges/AgentFlowEdge";
import { ToolCallEdge } from "./edges/ToolCallEdge";
import { HandoffEdge } from "./edges/HandoffEdge";
import { MemoryGraphCanvas } from "./memory/MemoryGraphCanvas";
import type { ViewMode } from "@/App";

// CRITICAL: nodeTypes/edgeTypes must be defined OUTSIDE the component
// to prevent React Flow remounting nodes on every render.
const nodeTypes = {
  orchestrator: OrchestratorNode,
  specialist: SpecialistNode,
  executionStep: ExecutionStepNode,
  toolCall: ExecutionStepNode,       // reuses ExecutionStepNode with toolCall data
  thinkingStream: ThinkingStreamNode,
  groupContainer: GroupContainerNode,
};

const edgeTypes = {
  agentFlow: AgentFlowEdge,
  toolCall: ToolCallEdge,
  handoff: HandoffEdge,
};

interface FlowCanvasProps {
  viewMode: ViewMode;
}

export default function FlowCanvas({ viewMode }: FlowCanvasProps) {
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const layoutVersion = useGraphStore((s) => s.layoutVersion);

  const nodes = useVisibleNodes();
  const edges = useVisibleEdges();

  // Auto-layout via ELK — runs when layoutVersion changes
  useAutoLayout(layoutVersion);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  // Show memory graph canvas when in memory view mode
  if (viewMode === "memory") {
    return <MemoryGraphCanvas />;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={24} size={1} className="opacity-20" />
      <Controls />
      <MiniMap
        nodeStrokeWidth={3}
        zoomable
        pannable
        className="!bg-neutral-900"
      />
    </ReactFlow>
  );
}
