// DetailPanel.tsx — Collapsible side panel for selected node details.
// Shows model provenance info for SpecialistNodes.

import { useSelectedNode } from "@/stores/selectors/graphSelectors";
import { useGraphStore } from "@/stores/graphStore";
import { NodeLevel } from "@mao/shared-types";
import type { SpecialistNodeData } from "@mao/shared-types";
import { modelDisplayName, providerLabel, modelBadgeClasses, detectProvider } from "@/utils/modelUtils";

export function DetailPanel() {
  const id = useGraphStore((s) => s.selectedNodeId);
  const node = useSelectedNode();

  if (!id || !node) {
    return (
      <div className="w-72 border-l border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-600 shrink-0">
        Click a node to inspect it.
      </div>
    );
  }

  const data = node.data;
  const isSpecialist = data.level === NodeLevel.Specialist;

  return (
    <div className="w-72 border-l border-neutral-800 bg-neutral-950 overflow-y-auto shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800">
        <p className="text-xs font-medium text-neutral-300">Node details</p>
        <p className="text-xs text-neutral-600 font-mono mt-0.5 truncate">{id}</p>
      </div>

      {/* Specialist — rich model info */}
      {isSpecialist && (() => {
        const sd = data as SpecialistNodeData;
        const provider = detectProvider(sd.model);
        return (
          <div className="p-4 border-b border-neutral-800 space-y-3">
            <div>
              <p className="text-xs text-neutral-500 mb-1">Model</p>
              <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${modelBadgeClasses(sd.model)}`}>
                {modelDisplayName(sd.model)}
              </span>
              <span className="ml-2 text-xs text-neutral-500">{providerLabel(sd.model)}</span>
            </div>

            <div>
              <p className="text-xs text-neutral-500 mb-1">Full model ID</p>
              <p className="text-xs font-mono text-neutral-400 break-all">{sd.model}</p>
            </div>

            {provider === "ollama" && (
              <div className="rounded bg-green-950/30 border border-green-800/30 px-2 py-1.5">
                <p className="text-xs text-green-400">Runs locally via Ollama — no API cost</p>
              </div>
            )}

            {provider === "openrouter" && (
              <div className="rounded bg-sky-950/30 border border-sky-800/30 px-2 py-1.5">
                <p className="text-xs text-sky-400">Cloud model via OpenRouter</p>
              </div>
            )}

            <div>
              <p className="text-xs text-neutral-500 mb-1">Tools ({sd.tools.length})</p>
              <div className="flex flex-wrap gap-1">
                {sd.tools.map((tool) => (
                  <span key={typeof tool === "string" ? tool : (tool as any).name}
                    className="text-xs px-1 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                    {typeof tool === "string"
                      ? tool.replace(/_tool$/, "")
                      : (tool as any).name ?? "tool"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Raw data */}
      <div className="p-4">
        <p className="text-xs text-neutral-600 mb-2">Raw data</p>
        <pre className="text-xs text-neutral-500 whitespace-pre-wrap break-all">
          {JSON.stringify(
            { ...data, embedding: undefined } as object,
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
}
