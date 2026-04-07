// ThinkingStreamNode.tsx — Level 4: Live streaming Chain-of-Thought node
//
// THE performance-critical node. Implements:
//   - Pattern 11: reads from streamingStore (RAF-buffered, never per-token)
//   - Pattern 12: Pretext-measured height (no getBoundingClientRect)
//   - Direct DOM mutation via textRef (no React setState per token)
//   - React.memo (MANDATORY — prevents re-renders from parent node updates)
//
// Update path per RAF frame (16ms):
//   streamingStore.appendBatch → this component's useEffect → textRef.current.textContent
//   + PretextService.getHeight → updateNode(height) — React Flow uses explicit height

import { memo, useEffect, useRef } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useStreamingStore } from "@/stores/streamingStore";
import { PretextService } from "@/services/PretextService";
import type { ThinkingStreamNodeData } from "@mao/shared-types";

const NODE_WIDTH = 320;
const LINE_HEIGHT = PretextService.LINE_HEIGHT;
const MAX_HEIGHT = 560;
const PADDING_V = 40; // header + padding

const ThinkingStreamNodeInner = ({ id, data }: NodeProps<ThinkingStreamNodeData>) => {
  const { updateNode } = useReactFlow();
  const textRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTextLengthRef = useRef(0);

  // Subscribe to streamingStore for THIS node only
  const streamState = useStreamingStore((s) => s.streams[id]);

  useEffect(() => {
    if (!streamState || !textRef.current) return;
    const { text, isStreaming } = streamState;

    // Skip if text hasn't changed
    if (text.length === lastTextLengthRef.current) return;
    lastTextLengthRef.current = text.length;

    // Direct DOM mutation — bypass React reconciliation entirely
    textRef.current.textContent = text;

    // Auto-scroll to bottom while streaming
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }

    // Pretext height measurement (Pattern 12) — NO getBoundingClientRect
    const measuredHeight = PretextService.getHeight(id, text, NODE_WIDTH - 32, LINE_HEIGHT);
    const clampedHeight = Math.min(measuredHeight + PADDING_V, MAX_HEIGHT);

    // Update React Flow node dimensions — it will use this instead of measuring DOM
    updateNode(id, { height: clampedHeight });

    // Store the height in streamingStore for other subscribers
    useStreamingStore.getState().setMeasuredHeight(id, clampedHeight);
  });

  // Evict Pretext cache when stream ends to free memory
  useEffect(() => {
    if (streamState && !streamState.isStreaming) {
      // Apply syntax highlighting post-stream (non-blocking)
      const timer = setTimeout(() => {
        PretextService.evict(id);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [id, streamState?.isStreaming]);

  const isStreaming = streamState?.isStreaming ?? false;
  const isThinking = streamState?.isThinking ?? true;

  return (
    <div className="thinking-stream-node relative w-80 rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 bg-neutral-800">
        <div
          className={`w-2 h-2 rounded-full ${
            isStreaming ? "animate-pulse bg-violet-400" : "bg-neutral-500"
          }`}
        />
        <span className="text-xs font-medium text-neutral-400">
          {isThinking ? "Reasoning" : "Response"}
        </span>
        {isStreaming && (
          <span className="ml-auto text-xs text-neutral-500 tabular-nums">
            {streamState?.totalTokens ?? 0} tokens
          </span>
        )}
      </div>

      {/* Scrollable text container */}
      <div
        ref={containerRef}
        className="overflow-y-auto"
        style={{ maxHeight: MAX_HEIGHT - PADDING_V }}
      >
        <pre
          ref={textRef}
          className="p-3 text-xs leading-5 text-neutral-300 font-mono whitespace-pre-wrap break-words m-0"
          // Text content is set via direct DOM mutation — not React state
        />
        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3.5 bg-violet-400 animate-pulse ml-1 mb-1" />
        )}
      </div>
    </div>
  );
};

// React.memo is MANDATORY — without it, every parent re-render (e.g. status update)
// would re-render this node even though the text hasn't changed.
export const ThinkingStreamNode = memo(ThinkingStreamNodeInner);
ThinkingStreamNode.displayName = "ThinkingStreamNode";
