// GroupContainerNode.tsx — Handle-less compound container
// Used as the invisible bounds zone for L1/L2 compound expand regions.

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

export const GroupContainerNode = memo((_props: NodeProps) => (
  <div
    className="w-full h-full rounded-xl border border-dashed border-neutral-700/50 bg-neutral-900/20"
    style={{ pointerEvents: "none" }}
  />
));
GroupContainerNode.displayName = "GroupContainerNode";
