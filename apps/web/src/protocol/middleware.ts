// protocol/middleware.ts — AG-UI event middleware: logging, metrics, filtering.
//
// Applied in AGUIEventRouter before events reach store handlers.
// Each middleware function receives the event and returns it (possibly
// transformed) or null to drop the event entirely.

import type { AgentEvent } from "@mao/shared-types";

type Middleware = (event: AgentEvent) => AgentEvent | null;

// ── Logging middleware ─────────────────────────────────────────────────────────

/** Log every event to the browser console in development mode. */
export const loggingMiddleware: Middleware = (event) => {
  if (import.meta.env.DEV) {
    const label = event.type === "CUSTOM"
      ? `CUSTOM:${(event as any).customType}`
      : event.type;
    console.debug(`[AG-UI] ${label}`, event);
  }
  return event;
};

// ── Metrics middleware ─────────────────────────────────────────────────────────

const _counts: Record<string, number> = {};

/** Count event types for lightweight in-browser telemetry. */
export const metricsMiddleware: Middleware = (event) => {
  const key = event.type === "CUSTOM"
    ? `CUSTOM:${(event as any).customType}`
    : event.type;
  _counts[key] = (_counts[key] ?? 0) + 1;
  return event;
};

/** Return the accumulated event counts (for a debug panel). */
export function getEventMetrics(): Record<string, number> {
  return { ..._counts };
}

// ── Filter middleware ──────────────────────────────────────────────────────────

/**
 * Drop events for workflows the frontend is not subscribed to.
 * Pass the active workflowId to compare against event.runId.
 */
export function createWorkflowFilter(activeWorkflowId: string | null): Middleware {
  return (event) => {
    if (!activeWorkflowId) return event;
    if ((event as any).runId !== activeWorkflowId) return null;
    return event;
  };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/** Apply a list of middleware functions in order. Returns null if any drops the event. */
export function applyMiddleware(
  event: AgentEvent,
  middlewares: Middleware[]
): AgentEvent | null {
  let current: AgentEvent | null = event;
  for (const mw of middlewares) {
    if (!current) return null;
    current = mw(current);
  }
  return current;
}

/** Default middleware pipeline used by AGUIEventRouter. */
export const DEFAULT_MIDDLEWARE: Middleware[] = [
  loggingMiddleware,
  metricsMiddleware,
];
