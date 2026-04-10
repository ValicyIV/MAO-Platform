// graphStore.ts — Topology state (Pattern 10)
// Update frequency: ~1-5/sec. Uses immer for deep mutations.
// SEPARATE from streamingStore to prevent token updates triggering graph re-renders.

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { applyEdgeChanges, applyNodeChanges, type Edge, type Node, type EdgeChange, type NodeChange } from "@xyflow/react";
import type { NodeDataUnion } from "@mao/shared-types";

interface GraphStore {
  nodes: Node<NodeDataUnion>[];
  edges: Edge[];
  expandedIds: Set<string>;
  layoutVersion: number;
  selectedNodeId: string | null;
  backendState: Record<string, unknown>;

  // Node mutations
  addNode: (node: Node<NodeDataUnion>) => void;
  applyLayout: (layout: Record<string, { x: number; y: number; width?: number; height?: number }>) => void;
  updateNodeData: (id: string, data: Partial<NodeDataUnion>) => void;
  updateNodeDimensions: (id: string, dims: { width?: number; height?: number }) => void;
  removeNode: (id: string) => void;

  // Edge mutations
  addEdge: (edge: Edge) => void;

  // React Flow callbacks
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  // Expand / collapse
  toggleExpand: (id: string) => void;
  setChildrenHidden: (parentId: string, hidden: boolean) => void;
  getDescendants: (id: string) => string[];

  // Sync from backend
  syncFromSnapshot: (snapshot: Record<string, unknown>) => void;
  applyStateDelta: (
    delta: Array<{ op: "add" | "remove" | "replace" | "move" | "copy" | "test"; path: string; value?: unknown; from?: string }>
  ) => void;

  // Layout trigger
  bumpLayout: () => void;

  // Selection
  setSelectedNodeId: (id: string | null) => void;

  // Reset
  reset: () => void;
}

export const useGraphStore = create<GraphStore>()(
  immer((set, get) => ({
    nodes: [],
    edges: [],
    expandedIds: new Set(),
    layoutVersion: 0,
    selectedNodeId: null,
    backendState: {},

    addNode: (node) =>
      set((s) => {
        if (!s.nodes.find((n) => n.id === node.id)) {
          s.nodes.push(node);
        }
      }),

    applyLayout: (layout) =>
      set((s) => {
        for (const node of s.nodes) {
          const positioned = layout[node.id];
          if (!positioned) continue;
          // Avoid unnecessary writes that can cause React Flow to emit
          // repeated change events (e.g. dimensions) and create update loops.
          if (node.position.x !== positioned.x || node.position.y !== positioned.y) {
            node.position = { x: positioned.x, y: positioned.y };
          }

          // Prefer explicit width/height fields over mutating style.
          if (positioned.width !== undefined && node.width !== positioned.width) {
            node.width = positioned.width;
          }
          if (positioned.height !== undefined && node.height !== positioned.height) {
            node.height = positioned.height;
          }
        }
      }),

    updateNodeData: (id, data) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (node) Object.assign(node.data, data);
      }),

    updateNodeDimensions: (id, dims) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        if (dims.width !== undefined) node.width = dims.width;
        if (dims.height !== undefined) node.height = dims.height;
      }),

    removeNode: (id) =>
      set((s) => {
        s.nodes = s.nodes.filter((n) => n.id !== id);
        s.edges = s.edges.filter((e) => e.source !== id && e.target !== id);
      }),

    addEdge: (edge) =>
      set((s) => {
        if (!s.edges.find((e) => e.id === edge.id)) {
          s.edges.push(edge);
        }
      }),

    onNodesChange: (changes) =>
      set((s) => {
        s.nodes = applyNodeChanges(changes, s.nodes) as Node<NodeDataUnion>[];
      }),

    onEdgesChange: (changes) =>
      set((s) => {
        s.edges = applyEdgeChanges(changes, s.edges);
      }),

    toggleExpand: (id) =>
      set((s) => {
        const isExpanded = s.expandedIds.has(id);
        if (isExpanded) {
          s.expandedIds.delete(id);
          // Hide all descendants
          const descendants = get().getDescendants(id);
          for (const descId of descendants) {
            const node = s.nodes.find((n) => n.id === descId);
            if (node) node.hidden = true;
          }
          for (const edge of s.edges) {
            if (
              get()
                .getDescendants(id)
                .includes(edge.source) ||
              get()
                .getDescendants(id)
                .includes(edge.target)
            ) {
              edge.hidden = true;
            }
          }
        } else {
          s.expandedIds.add(id);
          // Show immediate children only
          for (const node of s.nodes) {
            if (node.parentId === id) {
              node.hidden = false;
            }
          }
          for (const edge of s.edges) {
            const srcNode = s.nodes.find((n) => n.id === edge.source);
            if (srcNode?.parentId === id || edge.source === id) {
              edge.hidden = false;
            }
          }
        }
        s.layoutVersion++;
      }),

    setChildrenHidden: (parentId, hidden) =>
      set((s) => {
        for (const node of s.nodes) {
          if (node.parentId === parentId) node.hidden = hidden;
        }
      }),

    getDescendants: (id) => {
      const { nodes } = get();
      const result: string[] = [];
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const node of nodes) {
          if (node.parentId === current) {
            result.push(node.id);
            queue.push(node.id);
          }
        }
      }
      return result;
    },

    syncFromSnapshot: (snapshot) => {
      set((s) => {
        s.backendState = snapshot ?? {};
      });
    },

    applyStateDelta: (delta) => {
      set((s) => {
        if (!delta?.length) return;
        // Minimal RFC6902 support for add/replace/remove using JSON Pointer paths.
        const root = (s.backendState ?? {}) as Record<string, unknown>;
        for (const op of delta) {
          if (!op?.path || op.path[0] !== "/") continue;
          const parts = op.path
            .split("/")
            .slice(1)
            .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));

          const last = parts[parts.length - 1];
          if (!last) continue;

          let cur: any = root;
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i]!;
            if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== "object") {
              cur[key] = {};
            }
            cur = cur[key];
          }

          if (op.op === "remove") {
            if (cur && typeof cur === "object") {
              delete cur[last];
            }
          } else if (op.op === "add" || op.op === "replace") {
            cur[last] = op.value;
          }
        }
        s.backendState = root;
      });
    },

    bumpLayout: () => set((s) => { s.layoutVersion++; }),

    setSelectedNodeId: (id) => set((s) => { s.selectedNodeId = id; }),

    reset: () =>
      set((s) => {
        s.nodes = [];
        s.edges = [];
        s.expandedIds = new Set();
        s.layoutVersion = 0;
        s.selectedNodeId = null;
      }),
  }))
);
