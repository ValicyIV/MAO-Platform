// ThinkingStreamNode.tsx — Level 4: Live streaming Chain-of-Thought node
//
// THE performance-critical node. Implements:
//   - Pattern 11: reads from streamingStore (RAF-buffered, never per-token)
//   - Pattern 12: PRETEXT-only sizing (prepare + layout) — no DOM measurement for layout
//   - Direct DOM mutation via textRef for text only (no DOM reads for size/scroll)
//   - React.memo (MANDATORY — prevents re-renders from parent node updates)
//
// Node height is computed with PretextService before paint, then pushed to graphStore
// via updateNodeDimensions (no useUpdateNodeInternals / ResizeObserver for this node).

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { type NodeProps } from "@xyflow/react";
import { useStreamingStore } from "@/stores/streamingStore";
import { useGraphStore } from "@/stores/graphStore";
import { PretextService } from "@/services/PretextService";
import type { ThinkingStreamNodeData } from "@mao/shared-types";

const NODE_WIDTH = 320;
const LINE_HEIGHT = 20;
const MAX_HEIGHT = 560;
const PADDING_V = 40; // header + chrome
/** Vertical padding on `<pre>`: Tailwind `p-3` → 12px × 2 */
const PRE_PADDING_V = 24;
/** Approx. extra scroll extent for streaming cursor row below the pre */
const CURSOR_SCROLL_EXTRA = 20;

const ThinkingStreamNodeInner = ({ id }: NodeProps<ThinkingStreamNodeData>) => {
  const textRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef("");
  /** Skip identical dimension writes — avoids RF ↔ zustand feedback (#185 max update depth). */
  const lastReportedHeightRef = useRef<number>(-1);

  // Subscribe to streamingStore for THIS node only
  const streamState = useStreamingStore((s) => s.streams[id]);
  const text = streamState?.text ?? "";
  const isStreaming = streamState?.isStreaming ?? false;

  const textBlockHeight = useMemo(
    () => PretextService.getHeight(id, text, NODE_WIDTH, LINE_HEIGHT),
    [id, text]
  );

  const clampedHeight = Math.min(textBlockHeight + PADDING_V, MAX_HEIGHT);

  useLayoutEffect(() => {
    if (textRef.current && lastTextRef.current !== text) {
      lastTextRef.current = text;
      textRef.current.textContent = text;
    }
  }, [text]);

  useLayoutEffect(() => {
    if (lastReportedHeightRef.current === clampedHeight) return;
    lastReportedHeightRef.current = clampedHeight;
    useGraphStore.getState().updateNodeDimensions(id, { width: NODE_WIDTH, height: clampedHeight });
    useStreamingStore.getState().setMeasuredHeight(id, clampedHeight);
  }, [id, clampedHeight]);

  useLayoutEffect(() => {
    if (!isStreaming || !containerRef.current) return;
    const scrollViewport = Math.max(1, clampedHeight - PADDING_V);
    const contentHeight = textBlockHeight + PRE_PADDING_V + CURSOR_SCROLL_EXTRA;
    containerRef.current.scrollTop = Math.max(0, contentHeight - scrollViewport);
  }, [isStreaming, textBlockHeight, clampedHeight]);

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

  const isThinking = streamState?.isThinking ?? true;

  return (
    <div
      className="thinking-stream-node relative flex flex-col rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden"
      style={{ width: NODE_WIDTH, height: clampedHeight }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 border-b border-neutral-700 bg-neutral-800">
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
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
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
