// flow/hooks/useGraphBuilder.ts — Converts agent topology into React Flow nodes/edges.
//
// Called when a RUN_STARTED event arrives with agent config data from the backend.
// Builds the initial node/edge structure — ELK will reposition after mounting.

import { useCallback } from "react";
import { useGraphStore } from "@/stores/graphStore";
import {
  createOrchestratorNode,
  createSpecialistNode,
} from "@/flow/utils/nodeFactory";
import type { AgentConfig } from "@mao/shared-types";

interface WorkflowTopology {
  workflowId:   string;
  workflowName: string;
  agents:       AgentConfig[];
}

export function useGraphBuilder() {
  const { addNode, addEdge, bumpLayout, reset } = useGraphStore();

  /**
   * Initialise the graph for a new workflow.
   * Creates the orchestrator node + all specialist nodes (initially hidden).
   */
  const buildWorkflowGraph = useCallback(
    ({ workflowId, workflowName, agents }: WorkflowTopology) => {
      // Start fresh
      reset();

      // Level 1 — orchestrator
      const orchestrator = createOrchestratorNode(workflowId, workflowName);
      orchestrator.data.agentCount = agents.length;
      addNode(orchestrator);

      // Level 2 — specialist nodes (hidden until orchestrator expands)
      for (const agent of agents) {
        const specialist = createSpecialistNode(
          agent.id,
          agent.name,
          agent.role,
          agent.model,
          agent.tools,
          workflowId
        );
        addNode(specialist);

        // Delegation edge (hidden until expanded)
        addEdge({
          id:     `${workflowId}->${agent.id}`,
          source: workflowId,
          target: agent.id,
          type:   "agentFlow",
          hidden: true,
        });
      }

      bumpLayout();
    },
    [addNode, addEdge, bumpLayout, reset]
  );

  /**
   * Add a single specialist node to an existing graph.
   * Used when an agent spawns dynamically mid-workflow.
   */
  const addSpecialistNode = useCallback(
    (agent: AgentConfig, workflowId: string) => {
      const specialist = createSpecialistNode(
        agent.id,
        agent.name,
        agent.role,
        agent.model,
        agent.tools,
        workflowId
      );
      addNode(specialist);
      addEdge({
        id:     `${workflowId}->${agent.id}`,
        source: workflowId,
        target: agent.id,
        type:   "agentFlow",
        hidden: true,
      });

      // Update orchestrator agent count
      useGraphStore.getState().updateNodeData(workflowId, {
        agentCount: useGraphStore.getState().nodes.filter(
          (n) => n.parentId === workflowId
        ).length,
      } as any);

      bumpLayout();
    },
    [addNode, addEdge, bumpLayout]
  );

  return { buildWorkflowGraph, addSpecialistNode };
}
