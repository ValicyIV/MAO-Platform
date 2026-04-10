// MemoryGraphCanvas.tsx — ⚡ DRIVER: Fifth view mode (Pattern 16)
// Separate ReactFlow instance from FlowCanvas — completely decoupled from graphStore.
// Shows the Obsidian-style knowledge graph from memoryGraphStore.

import { memo } from "react";
import { ReactFlow, Background, Controls, MiniMap } from "@xyflow/react";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { useFilteredEntities } from "@/stores/selectors/memorySelectors";
import { EntityNode } from "./EntityNode";
import { RelationshipEdge } from "./RelationshipEdge";

const memoryNodeTypes = { memoryEntity: EntityNode };
const memoryEdgeTypes = { memoryRelationship: RelationshipEdge };

export const MemoryGraphCanvas = memo(() => {
  const isLoading = useMemoryGraphStore((s) => s.isLoading);
  const relationships = useMemoryGraphStore((s) => s.relationships);
  const searchQuery = useMemoryGraphStore((s) => s.searchQuery);
  const showTemporal = useMemoryGraphStore((s) => s.showTemporal);
  const setHighlighted = useMemoryGraphStore((s) => s.setHighlightedEntity);
  const setAgentFilter = useMemoryGraphStore((s) => s.setAgentFilter);
  const setSearchQuery = useMemoryGraphStore((s) => s.setSearchQuery);
  const toggleTemporal = useMemoryGraphStore((s) => s.toggleTemporal);
  const onNodesChange = useMemoryGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useMemoryGraphStore((s) => s.onEdgesChange);
  const entities = useFilteredEntities();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Loading knowledge graph…
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm">
        <span>No memory entities yet.</span>
        <span className="text-xs">Run a workflow to populate the knowledge graph.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col">
      {/* Memory graph toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950 text-xs">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entities…"
          className="w-48 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={() => setAgentFilter(null)}
          className="px-2 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200"
        >
          All agents
        </button>
        <button
          onClick={toggleTemporal}
          className={`px-2 py-1 rounded border transition-colors ${
            showTemporal
              ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
              : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Temporal
        </button>
        <span className="ml-auto text-neutral-600">{entities.length} entities</span>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={entities}
          edges={relationships}
          nodeTypes={memoryNodeTypes}
          edgeTypes={memoryEdgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setHighlighted(node.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} className="opacity-20" />
          <Controls />
          <MiniMap className="!bg-neutral-900" />
        </ReactFlow>
      </div>
    </div>
  );
});
MemoryGraphCanvas.displayName = "MemoryGraphCanvas";
