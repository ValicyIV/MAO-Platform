// streamingStore.ts — Streaming text state (Pattern 10)
// Update frequency: up to 60/sec (RAF-capped). NO immer — plain string concat is faster.
// MUST remain isolated from graphStore to prevent token updates causing graph re-renders.

import { create } from "zustand";
import type { StreamingState } from "@mao/shared-types";

interface StreamingStore {
  streams: Record<string, StreamingState>;

  startStream: (nodeId: string, agentId: string, messageId: string, isThinking: boolean, nodeWidth: number) => void;
  // Called once per RAF frame with the batch of tokens accumulated since last flush
  appendBatch: (nodeId: string, text: string) => void;
  setMeasuredHeight: (nodeId: string, height: number) => void;
  endStream: (nodeId: string) => void;
  clearStream: (nodeId: string) => void;
  clearAll: () => void;
}

export const useStreamingStore = create<StreamingStore>()((set) => ({
  streams: {},

  startStream: (nodeId, agentId, messageId, isThinking, nodeWidth) =>
    set((s) => ({
      streams: {
        ...s.streams,
        [nodeId]: {
          nodeId,
          agentId,
          messageId,
          text: "",
          isStreaming: true,
          isThinking,
          nodeWidth,
          measuredHeight: 80, // initial height before Pretext measures
          startedAt: Date.now(),
          endedAt: null,
          totalTokens: 0,
        },
      },
    })),

  // Plain object spread — no immer overhead for high-frequency string concat
  appendBatch: (nodeId, text) =>
    set((s) => {
      const existing = s.streams[nodeId];
      if (!existing) return s;
      return {
        streams: {
          ...s.streams,
          [nodeId]: {
            ...existing,
            text: existing.text + text,
            totalTokens: existing.totalTokens + text.length,
          },
        },
      };
    }),

  setMeasuredHeight: (nodeId, height) =>
    set((s) => {
      const existing = s.streams[nodeId];
      if (!existing) return s;
      return {
        streams: {
          ...s.streams,
          [nodeId]: { ...existing, measuredHeight: height },
        },
      };
    }),

  endStream: (nodeId) =>
    set((s) => {
      const existing = s.streams[nodeId];
      if (!existing) return s;
      return {
        streams: {
          ...s.streams,
          [nodeId]: { ...existing, isStreaming: false, endedAt: Date.now() },
        },
      };
    }),

  clearStream: (nodeId) =>
    set((s) => {
      const { [nodeId]: _, ...rest } = s.streams;
      return { streams: rest };
    }),

  clearAll: () => set({ streams: {} }),
}));
