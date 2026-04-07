// AgentBuilderPanel.tsx — Full agent builder modal.
//
// Tabs: Identity → Model → Tools → Personality → Preview
// Creates new custom agents or edits existing ones.
// Calls POST /api/agents/config (create) or PATCH /api/agents/config/{id} (edit).

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentDraft {
  id:                    string;
  name:                  string;
  role:                  string;
  model:                 string;
  description:           string;
  emoji:                 string;
  personality:           string;
  system_prompt:         string;
  temperature:           number;
  thinking_enabled:      boolean;
  thinking_budget_tokens: number;
  memory_enabled:        boolean;
  tools:                 string[];
  is_custom:             boolean;
  provider?:             string;
  badge_color?:          string;
}

interface ToolMeta  { label: string; icon: string; category: string }
interface RoleOpt   { value: string; label: string; emoji: string }
interface Template  { label: string; emoji: string; text: string }
interface BuilderMeta {
  available_tools:        Record<string, ToolMeta>;
  role_options:           RoleOpt[];
  personality_templates:  Record<string, Template>;
}

interface Props {
  existing?: AgentDraft | null;   // null = create mode
  onClose:   () => void;
  onSaved:   (agent: AgentDraft) => void;
}

// ── Emoji picker data ─────────────────────────────────────────────────────────

const EMOJI_OPTIONS = [
  "🤖","🧠","🔍","💻","📊","✍️","⚡","🎯","🔎","🧮","🎨","📈",
  "🌐","🔧","🗂️","📡","🛠️","🧬","🔬","🏗️","⚙️","🎓","💡","🚀",
  "🦾","🤝","📣","🔐","🌍","💎","🏆","🎪","🎭","🪄","🧩","🦊",
  "🐉","🦋","🌊","🔮","✨","🎸","🎵","🎬","📚","🖥️","🧪","🌺",
];

// ── Common model suggestions ──────────────────────────────────────────────────

const MODEL_GROUPS = [
  { group: "Anthropic",  models: ["claude-opus-4-6","claude-sonnet-4-6","claude-haiku-4-5"] },
  { group: "OpenAI",     models: ["openai/gpt-4o","openai/gpt-4o-mini","openai/o1-mini"] },
  { group: "Google",     models: ["google/gemini-2.0-flash-exp","google/gemini-2.5-pro-preview"] },
  { group: "Meta",       models: ["meta-llama/llama-3.3-70b-instruct","meta-llama/llama-3.1-8b-instruct"] },
  { group: "Mistral",    models: ["mistralai/mistral-large","mistralai/mistral-small-3.1-24b"] },
  { group: "Ollama ⬡",  models: ["ollama/llama3.2","ollama/mistral","ollama/phi4","ollama/qwen2.5-coder:7b","ollama/deepseek-r1:8b"] },
];

const TABS = ["Identity","Model","Tools","Personality"] as const;
type Tab = typeof TABS[number];

// ── Defaults ──────────────────────────────────────────────────────────────────

const DRAFT_DEFAULTS: AgentDraft = {
  id: "", name: "", role: "custom", model: "claude-sonnet-4-6",
  description: "", emoji: "🤖", personality: "", system_prompt: "",
  temperature: 1.0, thinking_enabled: false, thinking_budget_tokens: 4000,
  memory_enabled: true, tools: [], is_custom: true,
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentBuilderPanel({ existing, onClose, onSaved }: Props) {
  const isEdit = !!existing;

  const [tab,       setTab]      = useState<Tab>("Identity");
  const [draft,     setDraft]    = useState<AgentDraft>(existing ?? DRAFT_DEFAULTS);
  const [meta,      setMeta]     = useState<BuilderMeta | null>(null);
  const [saving,    setSaving]   = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const [showEmoji, setShowEmoji]= useState(false);
  const [idEdited,  setIdEdited] = useState(!!existing);

  // Fetch builder metadata
  useEffect(() => {
    fetch("/api/agents/builder/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);

  const set = (field: keyof AgentDraft, value: unknown) =>
    setDraft((d) => ({ ...d, [field]: value }));

  // Auto-generate ID from name
  const handleNameChange = (name: string) => {
    set("name", name);
    if (!idEdited) set("id", slugify(name));
  };

  const toggleTool = (toolId: string) => {
    set("tools", draft.tools.includes(toolId)
      ? draft.tools.filter((t) => t !== toolId)
      : [...draft.tools, toolId]
    );
  };

  const canSave = draft.name.trim() && draft.model.trim() &&
    (isEdit || (draft.id.trim() && /^[a-z0-9_-]+$/.test(draft.id)));

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const url  = isEdit ? `/api/agents/config/${existing!.id}` : "/api/agents/config";
      const method = isEdit ? "PATCH" : "POST";
      const body   = isEdit
        ? { name: draft.name, model: draft.model, description: draft.description,
            emoji: draft.emoji, personality: draft.personality,
            system_prompt: draft.system_prompt, temperature: draft.temperature,
            thinking_enabled: draft.thinking_enabled,
            thinking_budget_tokens: draft.thinking_budget_tokens,
            memory_enabled: draft.memory_enabled, tools: draft.tools }
        : { ...draft };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? `HTTP ${res.status}`);
      }
      const saved: AgentDraft = await res.json();
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [draft, canSave, isEdit, existing, onSaved, onClose]);

  const toolsByCategory = meta
    ? Object.entries(meta.available_tools).reduce<Record<string, [string, ToolMeta][]>>(
        (acc, [id, t]) => { (acc[t.category] ??= []).push([id, t]); return acc; }, {}
      )
    : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
          <span className="text-2xl">{draft.emoji}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100">
              {isEdit ? `Edit ${existing!.name}` : "New Agent"}
            </h2>
            <p className="text-xs text-neutral-500 truncate">
              {draft.name || "Untitled agent"} · {draft.model || "no model"}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 text-xl">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-neutral-800 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-blue-500 text-blue-300"
                  : "border-transparent text-neutral-500 hover:text-neutral-300",
              ].join(" ")}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* ── IDENTITY TAB ─────────────────────────────────────────────── */}
          {tab === "Identity" && (
            <div className="space-y-5">
              {/* Emoji picker */}
              <div>
                <label className="text-xs text-neutral-500 block mb-2">Avatar emoji</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowEmoji(!showEmoji)}
                    className="w-14 h-14 text-3xl rounded-xl border border-neutral-700 bg-neutral-800 hover:border-neutral-500 transition-colors flex items-center justify-center"
                  >
                    {draft.emoji}
                  </button>
                  {showEmoji && (
                    <div className="flex flex-wrap gap-1 p-2 rounded-lg border border-neutral-700 bg-neutral-800 max-w-xs">
                      {EMOJI_OPTIONS.map((em) => (
                        <button
                          key={em}
                          onClick={() => { set("emoji", em); setShowEmoji(false); }}
                          className="w-8 h-8 text-lg rounded hover:bg-neutral-700 transition-colors flex items-center justify-center"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Display name *</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Market Analyst"
                  maxLength={60}
                  className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* ID — only for new agents */}
              {!isEdit && (
                <div>
                  <label className="text-xs text-neutral-500 block mb-1.5">
                    ID (slug) * <span className="text-neutral-600">— used in config and API calls</span>
                  </label>
                  <input
                    type="text"
                    value={draft.id}
                    onChange={(e) => { setIdEdited(true); set("id", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "")); }}
                    placeholder="e.g. market_analyst"
                    className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 placeholder-neutral-600 font-mono focus:outline-none focus:border-blue-500"
                  />
                  {draft.id && !/^[a-z0-9_-]+$/.test(draft.id) && (
                    <p className="text-xs text-red-400 mt-1">Only lowercase letters, numbers, _ and - allowed</p>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Description</label>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="One sentence describing what this agent does"
                  maxLength={120}
                  className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Role</label>
                <div className="flex flex-wrap gap-2">
                  {(meta?.role_options ?? []).map((r) => (
                    <button
                      key={r.value}
                      onClick={() => set("role", r.value)}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                        draft.role === r.value
                          ? "border-blue-500/60 text-blue-300 bg-blue-500/10"
                          : "border-neutral-700 text-neutral-400 hover:text-neutral-200",
                      ].join(" ")}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── MODEL TAB ────────────────────────────────────────────────── */}
          {tab === "Model" && (
            <div className="space-y-5">
              {/* Model ID input */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">Model ID *</label>
                <input
                  type="text"
                  value={draft.model}
                  onChange={(e) => set("model", e.target.value)}
                  className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
                  placeholder="claude-sonnet-4-6 · openai/gpt-4o · ollama/llama3.2"
                />
                <p className="text-xs text-neutral-600 mt-1">
                  Format: <code>claude-*</code> (Anthropic), <code>ollama/name</code> (local), <code>org/model</code> (OpenRouter)
                </p>
              </div>

              {/* Model quick-picks */}
              <div>
                <label className="text-xs text-neutral-500 block mb-2">Quick pick</label>
                <div className="space-y-3">
                  {MODEL_GROUPS.map((g) => (
                    <div key={g.group}>
                      <p className="text-xs text-neutral-600 mb-1">{g.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.models.map((m) => (
                          <button
                            key={m}
                            onClick={() => set("model", m)}
                            className={[
                              "text-xs px-2.5 py-1 rounded border transition-colors font-mono",
                              draft.model === m
                                ? "border-blue-500/60 text-blue-300 bg-blue-500/10"
                                : "border-neutral-700 text-neutral-400 hover:text-neutral-200",
                            ].join(" ")}
                          >
                            {m.split("/").pop()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Temperature */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-neutral-500">Temperature</label>
                  <span className="text-xs text-neutral-400 tabular-nums">{draft.temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range" min={0} max={2} step={0.1}
                  value={draft.temperature}
                  onChange={(e) => set("temperature", Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-neutral-600 mt-0.5">
                  <span>Precise (0)</span><span>Balanced (1)</span><span>Creative (2)</span>
                </div>
              </div>

              {/* Thinking */}
              <div className="flex items-start gap-3 p-3 rounded-lg border border-neutral-800 bg-neutral-800/50">
                <input
                  type="checkbox" id="thinking"
                  checked={draft.thinking_enabled}
                  onChange={(e) => set("thinking_enabled", e.target.checked)}
                  className="mt-0.5 accent-violet-500"
                />
                <div>
                  <label htmlFor="thinking" className="text-sm text-neutral-200 cursor-pointer">
                    Extended thinking <span className="text-xs text-neutral-500">(Anthropic claude-* only)</span>
                  </label>
                  {draft.thinking_enabled && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-neutral-500">Budget tokens</span>
                        <span className="text-xs text-neutral-400 tabular-nums">{draft.thinking_budget_tokens.toLocaleString()}</span>
                      </div>
                      <input
                        type="range" min={1000} max={32000} step={1000}
                        value={draft.thinking_budget_tokens}
                        onChange={(e) => set("thinking_budget_tokens", Number(e.target.value))}
                        className="w-full accent-violet-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Memory */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-800 bg-neutral-800/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.memory_enabled}
                  onChange={(e) => set("memory_enabled", e.target.checked)}
                  className="accent-blue-500"
                />
                <div>
                  <p className="text-sm text-neutral-200">Knowledge graph memory</p>
                  <p className="text-xs text-neutral-500">Agent can read and write to the shared memory graph</p>
                </div>
              </label>
            </div>
          )}

          {/* ── TOOLS TAB ────────────────────────────────────────────────── */}
          {tab === "Tools" && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Select the tools this agent can use. Memory tools are added automatically when memory is enabled.
              </p>
              {Object.entries(toolsByCategory).map(([category, tools]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-neutral-400 mb-2">{category}</p>
                  <div className="space-y-1.5">
                    {tools.map(([id, t]) => (
                      <label
                        key={id}
                        className={[
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors",
                          draft.tools.includes(id)
                            ? "border-blue-500/40 bg-blue-500/5"
                            : "border-neutral-800 hover:border-neutral-700",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={draft.tools.includes(id)}
                          onChange={() => toggleTool(id)}
                          className="accent-blue-500"
                        />
                        <span className="text-base">{t.icon}</span>
                        <div>
                          <p className="text-sm text-neutral-200">{t.label}</p>
                          <p className="text-xs text-neutral-600 font-mono">{id}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {draft.tools.length > 0 && (
                <p className="text-xs text-neutral-500">
                  {draft.tools.length} tool{draft.tools.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {/* ── PERSONALITY TAB ──────────────────────────────────────────── */}
          {tab === "Personality" && (
            <div className="space-y-5">
              {/* Template presets */}
              {meta && (
                <div>
                  <label className="text-xs text-neutral-500 block mb-2">Personality presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => set("personality", "")}
                      className={[
                        "text-left px-3 py-2 rounded-lg border text-xs transition-colors",
                        !draft.personality
                          ? "border-blue-500/40 bg-blue-500/5 text-blue-300"
                          : "border-neutral-700 text-neutral-400 hover:text-neutral-200",
                      ].join(" ")}
                    >
                      <span className="text-base mr-2">🎭</span>
                      <span className="font-medium">None</span>
                      <p className="text-neutral-600 mt-0.5">Uses role defaults</p>
                    </button>
                    {Object.entries(meta.personality_templates).map(([key, tmpl]) => (
                      <button
                        key={key}
                        onClick={() => set("personality", tmpl.text)}
                        className={[
                          "text-left px-3 py-2 rounded-lg border text-xs transition-colors",
                          draft.personality === tmpl.text
                            ? "border-blue-500/40 bg-blue-500/5 text-blue-300"
                            : "border-neutral-700 text-neutral-400 hover:text-neutral-200",
                        ].join(" ")}
                      >
                        <span className="text-base mr-2">{tmpl.emoji}</span>
                        <span className="font-medium">{tmpl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Personality textarea */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">
                  Personality instructions
                  <span className="text-neutral-600 ml-2">Injected at the top of the system prompt</span>
                </label>
                <textarea
                  value={draft.personality}
                  onChange={(e) => set("personality", e.target.value)}
                  rows={5}
                  placeholder="Describe how this agent should think and communicate. E.g. 'You are skeptical and data-driven. Always cite sources. Prefer bullet points over prose.'"
                  className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Full system prompt override */}
              <div>
                <label className="text-xs text-neutral-500 block mb-1.5">
                  Full system prompt override
                  <span className="text-neutral-600 ml-2">Replaces everything if set</span>
                </label>
                <textarea
                  value={draft.system_prompt}
                  onChange={(e) => set("system_prompt", e.target.value)}
                  rows={8}
                  placeholder="Optional. Leave blank to use the role-based prompt + personality. Set this to completely control the system prompt."
                  className="w-full text-sm bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none font-mono text-xs"
                />
                {draft.system_prompt && (
                  <p className="text-xs text-amber-400 mt-1">
                    ⚠ Full override is set — personality field and role prompt will be ignored.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800">
          {/* Tab navigation */}
          <div className="flex gap-2">
            <button
              disabled={tab === TABS[0]}
              onClick={() => setTab(TABS[Math.max(0, TABS.indexOf(tab) - 1)])}
              className="text-xs px-3 py-1.5 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            {tab !== TABS[TABS.length - 1] && (
              <button
                onClick={() => setTab(TABS[Math.min(TABS.length - 1, TABS.indexOf(tab) + 1)])}
                className="text-xs px-3 py-1.5 rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200"
              >
                Next →
              </button>
            )}
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-300">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={[
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                canSave && !saving
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-neutral-700 text-neutral-500 cursor-not-allowed",
              ].join(" ")}
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create agent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
