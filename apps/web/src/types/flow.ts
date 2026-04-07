// types/flow.ts — FlowCanvas and viewport types.

import type { ViewMode } from "@/App";

export interface FlowCanvasProps {
  viewMode: ViewMode;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}
