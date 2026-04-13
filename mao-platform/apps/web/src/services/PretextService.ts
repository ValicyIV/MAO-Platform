// PretextService.ts — DOM-free text measurement (Pattern 12)
//
// Wraps @chenglou/pretext: prepare(text, font) once per distinct `text` per node,
// then layout(handle, width, lineHeight) whenever width/lineHeight change.
// No DOM measurement — graph node height comes from these numbers + updateNodeDimensions.

import { prepare, layout } from "@chenglou/pretext";

interface CacheEntry {
  handle: ReturnType<typeof prepare>;
  text: string;
}

class PretextServiceClass {
  private cache = new Map<string, CacheEntry>();

  // Must match ThinkingStreamNode: text-xs (12px), leading-5 (20px), font-mono
  static readonly FONT =
    '12px/20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  static readonly LINE_HEIGHT = 20; // px — Tailwind leading-5
  static readonly NODE_WIDTH = 320; // px default — overridden per node
  /** Horizontal inset: Tailwind `p-3` (12px) left + right on the `<pre>`. */
  static readonly TEXT_INSET_H = 24;

  /**
   * Text block height at the given outer node width (inner width = nodeWidth − TEXT_INSET_H).
   * prepare() only when `text` changed for this nodeId; layout() is pure arithmetic.
   */
  getHeight(
    nodeId: string,
    text: string,
    nodeWidth: number = PretextServiceClass.NODE_WIDTH,
    lineHeight: number = PretextServiceClass.LINE_HEIGHT
  ): number {
    if (!text) return lineHeight;

    const cached = this.cache.get(nodeId);
    let handle: ReturnType<typeof prepare>;

    if (!cached || cached.text !== text) {
      handle = prepare(text, PretextServiceClass.FONT);
      this.cache.set(nodeId, { handle, text });
    } else {
      handle = cached.handle;
    }

    const innerWidth = Math.max(0, nodeWidth - PretextServiceClass.TEXT_INSET_H);
    const { height } = layout(handle, innerWidth, lineHeight);
    return height;
  }

  /**
   * Release the cache entry for a stream that has ended.
   * Prevents unbounded memory growth during long sessions.
   */
  evict(nodeId: string): void {
    this.cache.delete(nodeId);
  }

  evictAll(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }
}

// Module-level singleton — shared across all ThinkingStreamNode instances
export const PretextService = new PretextServiceClass();
