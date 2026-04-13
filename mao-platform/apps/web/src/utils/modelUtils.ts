// utils/modelUtils.ts — Frontend model ID utilities.
//
// Mirrors the Python model_router.py logic so the UI renders correct
// badges and labels for any model ID — Anthropic, OpenRouter, or Ollama.
//
// Model ID convention (same as backend):
//   claude-*                  → Anthropic
//   ollama/<n>          → Ollama (local)
//   ollama/<n>:<tag>    → Ollama (local)
//   <org>/<model>             → OpenRouter (any cloud model)

export type ModelProvider = "anthropic" | "openrouter" | "ollama";

// ── Detection ──────────────────────────────────────────────────────────────

export function detectProvider(modelId: string): ModelProvider {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("ollama/") || modelId.startsWith("ollama:")) return "ollama";
  return "openrouter";
}

// ── Display name ────────────────────────────────────────────────────────────

export function modelDisplayName(modelId: string): string {
  const provider = detectProvider(modelId);

  if (provider === "anthropic") {
    if (modelId.includes("opus"))   return "Opus";
    if (modelId.includes("sonnet")) return "Sonnet";
    if (modelId.includes("haiku"))  return "Haiku";
    return modelId.split("-")[1]?.replace(/^\w/, (c) => c.toUpperCase()) ?? modelId;
  }

  if (provider === "ollama") {
    const clean = modelId.replace(/^ollama[/:]/,"");
    return `${clean} (local)`;
  }

  // OpenRouter: "openai/gpt-4o" → "GPT-4o"
  //             "google/gemini-2.0-flash-exp" → "Gemini 2.0 Flash"
  //             "meta-llama/llama-3.1-70b-instruct" → "Llama 3.1 70B"
  const name = modelId.split("/").at(-1) ?? modelId;
  const cleaned = name
    .replace(/-instruct$/, "")
    .replace(/-chat$/, "")
    .replace(/-preview$/, "")
    .replace(/-exp$/, "")
    .replace(/-latest$/, "");
  const parts = cleaned.split("-");
  if (parts[0]) {
    parts[0] = parts[0].length <= 4
      ? parts[0].toUpperCase()
      : parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return parts.join(" ");
}

// ── Tailwind badge classes ───────────────────────────────────────────────────

export function modelBadgeClasses(modelId: string): string {
  const provider = detectProvider(modelId);

  if (provider === "anthropic") {
    if (modelId.includes("opus"))   return "bg-violet-500/20 text-violet-300 border-violet-500/30";
    if (modelId.includes("sonnet")) return "bg-blue-500/20   text-blue-300   border-blue-500/30";
    if (modelId.includes("haiku"))  return "bg-teal-500/20   text-teal-300   border-teal-500/30";
    return "bg-neutral-700 text-neutral-300 border-neutral-600";
  }

  if (provider === "ollama") {
    return "bg-green-500/20 text-green-300 border-green-500/30";
  }

  // OpenRouter — color by org prefix
  if (modelId.startsWith("openai/"))        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (modelId.startsWith("google/"))         return "bg-sky-500/20     text-sky-300     border-sky-500/30";
  if (modelId.startsWith("meta-llama/"))     return "bg-indigo-500/20  text-indigo-300  border-indigo-500/30";
  if (modelId.startsWith("mistralai/"))      return "bg-orange-500/20  text-orange-300  border-orange-500/30";
  if (modelId.startsWith("anthropic/"))      return "bg-violet-500/20  text-violet-300  border-violet-500/30";
  if (modelId.startsWith("cohere/"))         return "bg-rose-500/20    text-rose-300    border-rose-500/30";
  if (modelId.startsWith("deepseek/"))       return "bg-cyan-500/20    text-cyan-300    border-cyan-500/30";
  if (modelId.startsWith("qwen/"))           return "bg-amber-500/20   text-amber-300   border-amber-500/30";
  return "bg-neutral-700 text-neutral-300 border-neutral-600";
}

// ── Provider label ───────────────────────────────────────────────────────────

export function providerLabel(modelId: string): string {
  const p = detectProvider(modelId);
  if (p === "anthropic")  return "Anthropic";
  if (p === "ollama")     return "Local";
  // OpenRouter: show the org
  const org = modelId.split("/")[0] ?? "OpenRouter";
  return org.charAt(0).toUpperCase() + org.slice(1);
}

// ── Capabilities ─────────────────────────────────────────────────────────────

export interface ModelCaps {
  extendedThinking: boolean;  // Anthropic only
  streaming:        boolean;
  toolUse:          boolean;
}

export function modelCaps(modelId: string): ModelCaps {
  const p = detectProvider(modelId);
  return {
    extendedThinking: p === "anthropic",
    streaming:        true,
    toolUse:          true,
  };
}
