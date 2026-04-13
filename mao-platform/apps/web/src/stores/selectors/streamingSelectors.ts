// selectors/streamingSelectors.ts
import { useStreamingStore } from "../streamingStore";

export const useStreamForNode = (nodeId: string) =>
  useStreamingStore((s) => s.streams[nodeId]);

export const useIsNodeStreaming = (nodeId: string) =>
  useStreamingStore((s) => s.streams[nodeId]?.isStreaming ?? false);

export const useActiveStreamCount = () =>
  useStreamingStore((s) => Object.values(s.streams).filter((st) => st.isStreaming).length);

export const useTotalTokenCount = () =>
  useStreamingStore((s) =>
    Object.values(s.streams).reduce((sum, st) => sum + st.totalTokens, 0)
  );
