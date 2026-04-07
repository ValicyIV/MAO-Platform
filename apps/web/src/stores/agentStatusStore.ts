// agentStatusStore.ts — Agent lifecycle state (Pattern 10)
// Update frequency: ~1-10/sec. Separate from graph topology.

import { create } from "zustand";
import type { AgentStatusEntry } from "@mao/shared-types";
import { AgentStatus } from "@mao/shared-types";

interface AgentStatusStore {
  statuses: Record<string, AgentStatusEntry>;
  setStatus: (agentId: string, status: AgentStatus) => void;
  setProgress: (agentId: string, progress: number, step?: string) => void;
  setError: (agentId: string, error: string) => void;
  incrementTokens: (agentId: string, count: number) => void;
  resetAll: () => void;
}

export const useAgentStatusStore = create<AgentStatusStore>()((set) => ({
  statuses: {},

  setStatus: (agentId, status) =>
    set((s) => ({
      statuses: {
        ...s.statuses,
        [agentId]: {
          agentId,
          status,
          currentStep: s.statuses[agentId]?.currentStep ?? null,
          progress: status === AgentStatus.Complete ? 100 : s.statuses[agentId]?.progress ?? 0,
          tokenCount: s.statuses[agentId]?.tokenCount ?? 0,
          error: status === AgentStatus.Error ? s.statuses[agentId]?.error ?? null : null,
          startedAt: status === AgentStatus.Running ? (s.statuses[agentId]?.startedAt ?? Date.now()) : (s.statuses[agentId]?.startedAt ?? null),
          finishedAt: status === AgentStatus.Complete || status === AgentStatus.Error ? Date.now() : null,
        },
      },
    })),

  setProgress: (agentId, progress, step) =>
    set((s) => ({
      statuses: {
        ...s.statuses,
        [agentId]: {
          ...(s.statuses[agentId] ?? { agentId, status: AgentStatus.Running, tokenCount: 0, error: null, startedAt: Date.now(), finishedAt: null }),
          progress,
          currentStep: step ?? s.statuses[agentId]?.currentStep ?? null,
        },
      },
    })),

  setError: (agentId, error) =>
    set((s) => ({
      statuses: {
        ...s.statuses,
        [agentId]: {
          ...(s.statuses[agentId] ?? { agentId, tokenCount: 0, progress: 0, currentStep: null, startedAt: null }),
          status: AgentStatus.Error,
          error,
          finishedAt: Date.now(),
        },
      },
    })),

  incrementTokens: (agentId, count) =>
    set((s) => {
      const existing = s.statuses[agentId];
      if (!existing) return s;
      return {
        statuses: {
          ...s.statuses,
          [agentId]: { ...existing, tokenCount: existing.tokenCount + count },
        },
      };
    }),

  resetAll: () => set({ statuses: {} }),
}));
