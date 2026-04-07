// protocol/customEvents.ts — MAO-specific AG-UI CUSTOM event type definitions.
// These extend the base AG-UI protocol with platform-specific event semantics.

import type { MAOCustomEventType, MAOEventPayloadMap } from "@mao/shared-types";

// Re-export for convenience throughout the frontend
export type { MAOCustomEventType, MAOEventPayloadMap };

// Event type constants — use these instead of raw strings to avoid typos
export const MAO_EVENTS = {
  THINKING_DELTA:      "thinking_delta"     as const,
  AGENT_HANDOFF:       "agent_handoff"      as const,
  MEMORY_UPDATE:       "memory_update"      as const,
  HEARTBEAT:           "heartbeat"          as const,
  CONFLICT_DETECTED:   "conflict_detected"  as const,
  VERIFICATION_START:  "verification_start" as const,
  PRIVACY_STRIP:       "privacy_strip"      as const,
} satisfies Record<string, MAOCustomEventType>;
