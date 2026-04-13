// AgentConfigPanel.tsx — Agent management panel.
// Lists all agents (built-in + custom) with quick-access Edit/Delete.
// Opens AgentBuilderPanel for create/edit.

import { useState, useEffect, useCallback } from "react";
import { AgentBuilderPanel } from "./AgentBuilderPanel";

interface AgentConfig {
  id: string; name: string; role: string; model: string;
  description: string; emoji: string; personality: string;
  system_prompt: string; temperature: number; thinking_enabled: boolean;
  thinking_budget_tokens: number; memory_enabled: boolean;
  is_custom: boolean; tools: string[];
  provider: string; display_name: string; badge_color: string;
}

interface Props { onClose: () => void }

const PROVIDER_BADGE: Record<string, string> = {
  anthropic:  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  openrouter: "bg-blue-500/20   text-blue-300   border-blue-500/30",
  ollama:     "bg-green-500/20  text-green-300  border-green-500/30",
};

export function AgentConfigPanel({ onClose }: Props) {
  const [agents,     setAgents]     = useState<AgentConfig[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  // undefined=closed  null=create  AgentConfig=edit
  const [editTarget, setEditTarget] = useState<AgentConfig | null | undefined>(undefined);

  const fetchAgents = useCallback(() => {
    setLoading(true);
    fetch("/api/agents/config")
      .then((r) => r.json())
      .then((d: AgentConfig[]) => { setAgents(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleDelete = async (agent: AgentConfig) => {
    if (!agent.is_custom) return;
    if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;
    setDeleting(agent.id);
    try {
      await fetch(`/api/agents/config/${agent.id}`, { method: "DELETE" });
      setAgents((p) => p.filter((a) => a.id !== agent.id));
    } catch (e) { setError(String(e)); }
    finally { setDeleting(null); }
  };

  const handleReset = async (agent: AgentConfig) => {
    if (!confirm(`Reset "${agent.name}" to defaults?`)) return;
    const res = await fetch(`/api/agents/config/${agent.id}/reset`, { method: "POST" });
    const updated: AgentConfig = await res.json();
    setAgents((p) => p.map((a) => (a.id === agent.id ? updated : a)));
  };

  const builtIns = agents.filter((a) => !a.is_custom);
  const custom   = agents.filter((a) =>  a.is_custom);

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
        <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">

          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">Agents</h2>
              <p className="text-xs text-neutral-500 mt-0.5">{agents.length} agents · {custom.length} custom</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setEditTarget(null)}
                className="text-xs px-4 py-1.5 rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-colors">
                + New agent
              </button>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-xl">×</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {error && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</div>}
            {loading && <div className="text-center text-neutral-500 py-10 text-sm">Loading…</div>}

            {builtIns.length > 0 && (
              <div>
                <p className="text-xs text-neutral-600 uppercase tracking-wide px-2 mb-2">Built-in</p>
                {builtIns.map((a) => (
                  <AgentRow key={a.id} agent={a} badge={PROVIDER_BADGE[a.provider] ?? ""}
                    onEdit={() => setEditTarget(a)} onDelete={() => handleDelete(a)}
                    onReset={() => handleReset(a)} isDeleting={deleting === a.id} />
                ))}
              </div>
            )}

            {custom.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-neutral-600 uppercase tracking-wide px-2 mb-2">Custom</p>
                {custom.map((a) => (
                  <AgentRow key={a.id} agent={a} badge={PROVIDER_BADGE[a.provider] ?? ""}
                    onEdit={() => setEditTarget(a)} onDelete={() => handleDelete(a)}
                    onReset={() => handleReset(a)} isDeleting={deleting === a.id} />
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-neutral-800 text-xs text-neutral-600">
            Changes persist to <code className="text-neutral-500">data/agents.json</code> and apply on next run.
          </div>
        </div>
      </div>

      {editTarget !== undefined && (
        <AgentBuilderPanel
          existing={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={(saved) => {
            const normalized: AgentConfig = {
              ...saved,
              provider: saved.provider ?? "custom",
              display_name: saved.name,
              badge_color: saved.badge_color ?? "neutral",
            };
            setAgents((prev) =>
              prev.find((a) => a.id === normalized.id)
                ? prev.map((a) => (a.id === normalized.id ? normalized : a))
                : [...prev, normalized]
            );
            setEditTarget(undefined);
          }}
        />
      )}
    </>
  );
}

function AgentRow({ agent, badge, onEdit, onDelete, onReset, isDeleting }:
  { agent: AgentConfig; badge: string; onEdit: () => void;
    onDelete: () => void; onReset: () => void; isDeleting: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-lg border border-neutral-800 hover:border-neutral-700 transition-colors group">
      <span className="text-2xl shrink-0 w-9 text-center">{agent.emoji || "🤖"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">{agent.name}</span>
          {agent.is_custom && <span className="text-xs px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">custom</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs px-1.5 py-0.5 rounded border ${badge}`}>{agent.display_name}</span>
          {agent.thinking_enabled && <span className="text-xs text-violet-400">✦ thinking</span>}
          {agent.tools.length > 0 && <span className="text-xs text-neutral-600">{agent.tools.length} tools</span>}
          {agent.personality && <span className="text-xs text-neutral-600">✎ persona</span>}
        </div>
        {agent.description && <p className="text-xs text-neutral-600 truncate mt-0.5">{agent.description}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit}
          className="text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200">Edit</button>
        {!agent.is_custom && (
          <button onClick={onReset}
            className="text-xs px-2.5 py-1 rounded border border-neutral-700 text-neutral-500 hover:text-neutral-300">Reset</button>
        )}
        {agent.is_custom && (
          <button onClick={onDelete} disabled={isDeleting}
            className="text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            {isDeleting ? "…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
