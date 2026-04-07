// constants.ts — shared UI constants

export const NODE_WIDTH         = 320;  // px — default node width
export const LINE_HEIGHT        = 20;   // px — Pretext line height
export const FONT               = "14px Inter, ui-sans-serif, sans-serif";
export const MAX_NODE_HEIGHT    = 560;  // px — ThinkingStreamNode cap
export const RAF_BATCH_MS       = 16;   // ms — requestAnimationFrame interval
export const ELK_DEBOUNCE_MS    = 50;   // ms — layout debounce
export const WS_RECONNECT_MAX   = 30_000; // ms — max reconnect backoff

export const THINKING_NODE_WIDTH = NODE_WIDTH;
export const THINKING_PADDING_V  = 40;  // header + padding

// Node z-index layers
export const Z_GROUP   = 0;
export const Z_AGENT   = 1;
export const Z_STEP    = 2;
export const Z_THINK   = 3;
