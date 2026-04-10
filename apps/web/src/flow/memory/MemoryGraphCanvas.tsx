// MemoryGraphCanvas.tsx ΓÇö ΓÜí DRIVER: Fifth view mode (Pattern 16)
// Separate ReactFlow instance from FlowCanvas ΓÇö completely decoupled from graphStore.
// Shows the Obsidian-style knowledge graph from memoryGraphStore.

import { memo, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import { useMemoryGraphStore } from "@/stores/memoryGraphStore";
import { useFilteredEntities } from "@/stores/selectors/memorySelectors";
import { EntityNode } from "./EntityNode";
import { RelationshipEdge } from "./RelationshipEdge";

const memoryNodeTypes = { memoryEntity: EntityNode };
const memoryEdgeTypes = { memoryRelationship: RelationshipEdge };
const memoryNodeTypesRf = memoryNodeTypes as unknown as NodeTypes;
const memoryEdgeTypesRf = memoryEdgeTypes as unknown as EdgeTypes;

export const MemoryGraphCanvas = memo(() => {
  const isLoading = useMemoryGraphStore((s) => s.isLoading);
  const lastFetchError = useMemoryGraphStore((s) => s.lastFetchError);
  const entityCount = useMemoryGraphStore((s) => s.entities.length);
  const fetchGraph = useMemoryGraphStore((s) => s.fetchGraph);
  const activeAgentFilter = useMemoryGraphStore((s) => s.activeAgentFilter);
  const relationships = useMemoryGraphStore((s) => s.relationships);
  const searchQuery = useMemoryGraphStore((s) => s.searchQuery);
  const showTemporal = useMemoryGraphStore((s) => s.showTemporal);
  const setHighlighted = useMemoryGraphStore((s) => s.setHighlightedEntity);
  const setAgentFilter = useMemoryGraphStore((s) => s.setAgentFilter);
  const setSearchQuery = useMemoryGraphStore((s) => s.setSearchQuery);
  const toggleTemporal = useMemoryGraphStore((s) => s.toggleTemporal);
  const entities = useFilteredEntities();
  const visibleEdges = useMemo(() => {
    const ids = new Set(entities.map((e) => e.id));
    return relationships.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [entities, relationships]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Loading knowledge graphΓÇª
      </div>
    );
  }

  if (lastFetchError && entityCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center text-sm text-neutral-400 max-w-lg mx-auto">
        <p className="text-red-400/90">{lastFetchError}</p>
        <button
          type="button"
          onClick={() => fetchGraph(activeAgentFilter ?? undefined)}
          className="px-3 py-1.5 rounded-md border border-neutral-500 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (entities.length === 0) {
    if (entityCount > 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500 text-sm px-6 text-center">
          <span>No entities match your search or filters.</span>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setAgentFilter(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-500 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
          >
            Clear search and filters
          </button>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm">
        <span>No memory entities yet.</span>
        <span className="text-xs">Run a workflow to populate the knowledge graph.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col">
      {lastFetchError && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-900/50 bg-amber-950/40 text-xs text-amber-200/90">
          <span className="flex-1">{lastFetchError}</span>
          <button
            type="button"
            onClick={() => fetchGraph(activeAgentFilter ?? undefined)}
            className="shrink-0 px-2 py-1 rounded border border-amber-500/70 bg-amber-900/20 text-amber-100 hover:bg-amber-900/35"
          >
            Retry
          </button>
        </div>
      )}
      {/* Memory graph toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950 text-xs">
        <input
          id="memory-search-input"
          name="memorySearch"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entitiesΓÇª"
          className="w-48 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={() => setAgentFilter(null)}
          className="px-2 py-1 rounded border border-neutral-600 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
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
          edges={visibleEdges}
          nodeTypes={memoryNodeTypesRf}
          edgeTypes={memoryEdgeTypesRf}
          onNodeClick={(_, node) => setHighlighted(node.id)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
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
