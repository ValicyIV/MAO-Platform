// selectors/memorySelectors.ts
import { useMemoryGraphStore } from "../memoryGraphStore";
import { MemoryEntityType } from "@mao/shared-types";

export const useFilteredEntities = () =>
  useMemoryGraphStore((s) => {
    let entities = s.entities;
    if (s.activeAgentFilter) {
      entities = entities.filter(
        (e) => e.data.agentId === s.activeAgentFilter || e.data.entityType === MemoryEntityType.Agent
      );
    }
    if (s.searchQuery.trim()) {
      const q = s.searchQuery.toLowerCase();
      entities = entities.filter(
        (e) =>
          e.data.label.toLowerCase().includes(q) ||
          (e.data.summary ?? "").toLowerCase().includes(q)
      );
    }
    return entities;
  });

export const useContradictedFacts = () =>
  useMemoryGraphStore((s) => s.entities.filter((e) => e.data.isContradicted));

export const useRecentMemories = (limit = 10) =>
  useMemoryGraphStore((s) =>
    [...s.entities]
      .sort((a, b) => b.data.updatedAt - a.data.updatedAt)
      .slice(0, limit)
  );

export const useEntityNeighborhood = (entityId: string | null) =>
  useMemoryGraphStore((s) => {
    if (!entityId) return { nodes: [], edges: [] };
    const directEdges = s.relationships.filter(
      (r) => r.source === entityId || r.target === entityId
    );
    const neighborIds = new Set<string>(
      directEdges.flatMap((r) => [r.source, r.target])
    );
    return {
      nodes: s.entities.filter((e) => neighborIds.has(e.id)),
      edges: directEdges,
    };
  });
