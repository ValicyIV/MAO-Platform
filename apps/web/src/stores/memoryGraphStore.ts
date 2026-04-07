// memoryGraphStore.ts — Memory Graph state (Pattern 16)
// Separate store from graphStore — update frequency ~1/30s (on consolidation events).
// Feeds the MemoryGraphCanvas fifth view mode.

import { create } from "zustand";
import type { MemoryNodeData, MemoryEdgeData, MemoryDelta } from "@mao/shared-types";
import type { Node, Edge } from "@xyflow/react";

interface MemoryGraphStore {
  entities: Node<MemoryNodeData>[];
  relationships: Edge<MemoryEdgeData>[];
  activeAgentFilter: string | null;
  showTemporal: boolean;
  searchQuery: string;
  highlightedEntityId: string | null;
  isLoading: boolean;
  lastFetchedAt: number | null;
  conflictCount: number;

  // Fetch from backend
  fetchGraph: (agentId?: string) => Promise<void>;

  // Live update from consolidation WebSocket event
  applyMemoryDelta: (delta: MemoryDelta) => void;

  // Filters
  setAgentFilter: (agentId: string | null) => void;
  setSearchQuery: (q: string) => void;
  toggleTemporal: () => void;
  setHighlightedEntity: (entityId: string | null) => void;

  reset: () => void;
}

export const useMemoryGraphStore = create<MemoryGraphStore>()((set, get) => ({
  entities: [],
  relationships: [],
  activeAgentFilter: null,
  showTemporal: false,
  searchQuery: "",
  highlightedEntityId: null,
  isLoading: false,
  lastFetchedAt: null,
  conflictCount: 0,

  fetchGraph: async (agentId) => {
    set({ isLoading: true });
    try {
      const url = agentId
        ? `/api/memory/graph/${agentId}`
        : `/api/memory/graph`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const entities: Node<MemoryNodeData>[] = data.entities.map((e: { id: string; data: MemoryNodeData; position?: { x: number; y: number } }) => ({
        id: e.id,
        type: "memoryEntity",
        position: e.position ?? { x: 0, y: 0 },
        data: e.data,
      }));

      const relationships: Edge<MemoryEdgeData>[] = data.relationships.map((r: { id: string; source: string; target: string; data: MemoryEdgeData }) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        type: "memoryRelationship",
        data: r.data,
      }));

      set({
        entities,
        relationships,
        activeAgentFilter: agentId ?? null,
        lastFetchedAt: Date.now(),
        isLoading: false,
      });
    } catch (e) {
      console.error("Failed to fetch memory graph:", e);
      set({ isLoading: false });
    }
  },

  applyMemoryDelta: (delta) =>
    set((s) => {
      // Add new entities
      const newEntities = [...s.entities];
      for (const added of delta.added) {
        if (!newEntities.find((e) => e.id === added.entityId)) {
          newEntities.push({
            id: added.entityId,
            type: "memoryEntity",
            position: { x: 0, y: 0 }, // ELK will reposition
            data: added,
          });
        }
      }

      // Update existing entities
      for (const updated of delta.updated) {
        const idx = newEntities.findIndex((e) => e.id === updated.entityId);
        if (idx >= 0) {
          newEntities[idx] = { ...newEntities[idx]!, data: updated };
        }
      }

      // Remove deleted entities
      const filteredEntities = newEntities.filter((e) => !delta.removed.includes(e.id));

      // Add new relationships
      const newRelationships = [...s.relationships];
      for (const edge of delta.addedEdges) {
        const id = `${edge.source}-${edge.data.relationship}-${edge.target}`;
        if (!newRelationships.find((r) => r.id === id)) {
          newRelationships.push({
            id,
            source: edge.source,
            target: edge.target,
            type: "memoryRelationship",
            data: edge.data,
          });
        }
      }

      return {
        entities: filteredEntities,
        relationships: newRelationships,
        conflictCount: s.conflictCount + delta.conflicts.length,
      };
    }),

  setAgentFilter: (agentId) => {
    set({ activeAgentFilter: agentId });
    get().fetchGraph(agentId ?? undefined);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleTemporal: () => set((s) => ({ showTemporal: !s.showTemporal })),

  setHighlightedEntity: (entityId) => set({ highlightedEntityId: entityId }),

  reset: () =>
    set({
      entities: [],
      relationships: [],
      activeAgentFilter: null,
      searchQuery: "",
      highlightedEntityId: null,
      conflictCount: 0,
      lastFetchedAt: null,
    }),
}));
