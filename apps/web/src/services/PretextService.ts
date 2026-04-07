// PretextService.ts — DOM-free text measurement (Pattern 12)
//
// Wraps @chenglou/pretext to eliminate layout thrashing during streaming.
// prepare() is called once per text change (cached by accumulated length).
// layout() is pure arithmetic — ~0.0002ms per call.
//
// The measured height is passed to React Flow's updateNode() so it skips
// getBoundingClientRect() entirely for ThinkingStreamNodes.

import { prepare, layout } from "@chenglou/pretext";

interface CacheEntry {
  handle: ReturnType<typeof prepare>;
  textLength: number;
}

class PretextServiceClass {
  private cache = new Map<string, CacheEntry>();

  // Default typography constants — must match ThinkingStreamNode CSS
  static readonly FONT = "14px Inter, ui-sans-serif, sans-serif";
  static readonly LINE_HEIGHT = 20; // px
  static readonly NODE_WIDTH = 320; // px default — overridden per node

  /**
   * Returns the measured height for the given text at the given container width.
   * Calls prepare() only when text length has changed (cache key = nodeId).
   * layout() always runs (pure arithmetic, negligible cost).
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

    if (!cached || cached.textLength !== text.length) {
      // prepare() is the expensive call (~1-5ms) — run only when length changes
      handle = prepare(text, PretextServiceClass.FONT);
      this.cache.set(nodeId, { handle, textLength: text.length });
    } else {
      handle = cached.handle;
    }

    const innerWidth = nodeWidth - 32; // 16px padding each side
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
