// DetailPanel.tsx — Collapsible side panel for selected node details

import { useSelectedNode } from "@/stores/selectors/graphSelectors";

export function DetailPanel() {
  const { id, node } = useSelectedNode();

  if (!id || !node) {
    return (
      <div className="w-72 border-l border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-600">
        Click a node to inspect it.
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-neutral-800 bg-neutral-950 overflow-y-auto">
      <div className="p-4 border-b border-neutral-800">
        <p className="text-xs font-medium text-neutral-300">Node details</p>
        <p className="text-xs text-neutral-500 font-mono mt-1">{id}</p>
      </div>
      <div className="p-4">
        <pre className="text-xs text-neutral-400 whitespace-pre-wrap break-all">
          {JSON.stringify(node.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
