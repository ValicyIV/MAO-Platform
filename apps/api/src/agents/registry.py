"""
agents/registry.py — Agent registry with full CRUD.

Three-layer config (lowest to highest priority):
  1. Code defaults   — _code_defaults() below
  2. Env var layer   — SUPERVISOR_MODEL, RESEARCH_MODEL, etc.
  3. File layer      — data/agents.json (written by API/UI)

agents.json schema:
  {
    "research": { "model": "ollama/llama3.2" },      ← built-in override
    "my_analyst": {                                    ← custom agent
      "is_custom": true,
      "name": "Market Analyst",
      "emoji": "📊",
      "role": "custom",
      "model": "openai/gpt-4o",
      "personality": "You are a sharp...",
      "tools": ["web_search", "python_repl"]
    }
  }
"""
from __future__ import annotations

import json
import logging
import os
from copy import deepcopy
from dataclasses import asdict
from pathlib import Path
from typing import Any

from src.agents.base import AgentConfig, create_specialist_agent
from src.config.settings import settings

log = logging.getLogger(__name__)

AGENTS_CONFIG_PATH = Path(os.environ.get("AGENTS_CONFIG_PATH", "./data/agents.json"))

_dirty = True
_built_agents: dict[str, Any] | None = None
_resolved: dict[str, AgentConfig] | None = None


# ── Available tools (shown in builder UI) ─────────────────────────────────────

AVAILABLE_TOOLS: dict[str, dict[str, str]] = {
    "web_search":       {"label": "Web Search",       "icon": "🔍", "category": "Research"},
    "fetch_url":        {"label": "Fetch URL",         "icon": "🌐", "category": "Research"},
    "arxiv_search":     {"label": "arXiv Search",      "icon": "📚", "category": "Research"},
    "python_repl":      {"label": "Python REPL",       "icon": "🐍", "category": "Code"},
    "bash_exec":        {"label": "Bash Shell",        "icon": "💻", "category": "Code"},
    "read_file":        {"label": "Read File",         "icon": "📄", "category": "Files"},
    "write_file":       {"label": "Write File",        "icon": "✏️",  "category": "Files"},
    "format_markdown":  {"label": "Format Markdown",   "icon": "📝", "category": "Files"},
    "sql_query":        {"label": "SQL Query",         "icon": "🗄️",  "category": "Data"},
    "remember_fact":    {"label": "Remember Fact",     "icon": "🧠", "category": "Memory"},
    "recall":           {"label": "Recall",            "icon": "💭", "category": "Memory"},
    "link_concepts":    {"label": "Link Concepts",     "icon": "🔗", "category": "Memory"},
}

# ── Role definitions ──────────────────────────────────────────────────────────

ROLE_OPTIONS: list[dict[str, str]] = [
    {"value": "research",    "label": "Research",    "emoji": "🔍"},
    {"value": "code",        "label": "Code",        "emoji": "💻"},
    {"value": "data",        "label": "Data",        "emoji": "📊"},
    {"value": "writer",      "label": "Writer",      "emoji": "✍️"},
    {"value": "analyst",     "label": "Analyst",     "emoji": "🧮"},
    {"value": "reviewer",    "label": "Reviewer",    "emoji": "🔎"},
    {"value": "strategist",  "label": "Strategist",  "emoji": "♟️"},
    {"value": "custom",      "label": "Custom",      "emoji": "⚡"},
]

# ── Personality templates ─────────────────────────────────────────────────────

PERSONALITY_TEMPLATES: dict[str, dict[str, str]] = {
    "analytical": {
        "label": "Analytical",
        "emoji": "🧮",
        "text": (
            "You are methodical and data-driven. Always quantify claims when possible. "
            "Structure responses with clear reasoning steps. Flag assumptions explicitly. "
            "Prefer concrete evidence over conjecture."
        ),
    },
    "creative": {
        "label": "Creative",
        "emoji": "🎨",
        "text": (
            "You approach problems with lateral thinking and creative energy. "
            "Explore unconventional angles. Use vivid examples and analogies. "
            "Don't be constrained by how things have always been done."
        ),
    },
    "adversarial": {
        "label": "Adversarial Reviewer",
        "emoji": "🔎",
        "text": (
            "Your job is to find what's wrong, not confirm what's right. "
            "Be skeptical. Challenge assumptions. Look for edge cases, logical gaps, "
            "and unstated dependencies. A clean review is a thorough review."
        ),
    },
    "concise": {
        "label": "Concise & Direct",
        "emoji": "⚡",
        "text": (
            "Be maximally concise. No preamble, no filler. Lead with the answer. "
            "Use bullet points over paragraphs. If something can be said in 10 words, "
            "don't use 20."
        ),
    },
    "expert": {
        "label": "Domain Expert",
        "emoji": "🎓",
        "text": (
            "Operate at the level of a senior practitioner. Skip basics. "
            "Use precise technical vocabulary. Acknowledge nuance and edge cases. "
            "Cite relevant patterns and prior art when applicable."
        ),
    },
    "socratic": {
        "label": "Socratic",
        "emoji": "❓",
        "text": (
            "Guide through questions rather than direct answers where useful. "
            "Help the user discover insights themselves. Surface underlying assumptions. "
            "Check understanding at key steps."
        ),
    },
}


# ── Layer 1: Code defaults ────────────────────────────────────────────────────

def _code_defaults() -> dict[str, dict[str, Any]]:
    supervisor_model = settings.resolve_model_for_available_providers(
        "claude-opus-4-6",
        anthropic_fallback="claude-opus-4-6",
        openrouter_fallback="openai/gpt-4o-mini",
    )
    specialist_model = settings.resolve_model_for_available_providers(
        "claude-sonnet-4-6",
        anthropic_fallback="claude-sonnet-4-6",
        openrouter_fallback="openai/gpt-4o-mini",
    )
    return {
        "supervisor": {
            "name": "Supervisor", "role": "orchestrator", "emoji": "🧭",
            "model": supervisor_model,
            "description": "Plans and delegates tasks to specialist agents.",
            "temperature": 1.0, "thinking_enabled": True,
            "thinking_budget_tokens": 10000, "memory_enabled": True,
        },
        "research": {
            "name": "Research Agent", "role": "research", "emoji": "🔍",
            "model": specialist_model,
            "description": "Searches the web and synthesises research findings.",
            "temperature": 1.0, "thinking_enabled": True,
            "thinking_budget_tokens": settings.thinking_budget_tokens, "memory_enabled": True,
        },
        "code": {
            "name": "Code Agent", "role": "code", "emoji": "💻",
            "model": specialist_model,
            "description": "Writes, executes, and debugs code.",
            "temperature": 1.0, "thinking_enabled": True,
            "thinking_budget_tokens": settings.thinking_budget_tokens, "memory_enabled": True,
        },
        "data": {
            "name": "Data Agent", "role": "data", "emoji": "📊",
            "model": specialist_model,
            "description": "Analyses data and generates visualisations.",
            "temperature": 1.0, "thinking_enabled": True,
            "thinking_budget_tokens": settings.thinking_budget_tokens, "memory_enabled": True,
        },
        "writer": {
            "name": "Writer Agent", "role": "writer", "emoji": "✍️",
            "model": specialist_model,
            "description": "Composes and edits documents and prose.",
            "temperature": 1.0, "thinking_enabled": False,
            "thinking_budget_tokens": 0, "memory_enabled": True,
        },
        "verifier": {
            "name": "Verifier", "role": "verifier", "emoji": "✅",
            "model": specialist_model,
            "description": "Adversarial reviewer — finds errors, not confirmations.",
            "temperature": 1.0, "thinking_enabled": True,
            "thinking_budget_tokens": 4000, "memory_enabled": False,
        },
    }


# ── Layer 2: Env vars ─────────────────────────────────────────────────────────

def _env_overrides() -> dict[str, dict[str, Any]]:
    overrides: dict[str, dict[str, Any]] = {}
    for env_name, agent_name in {
        "SUPERVISOR": "supervisor", "RESEARCH": "research", "CODE": "code",
        "DATA": "data", "WRITER": "writer", "VERIFIER": "verifier",
    }.items():
        patch: dict[str, Any] = {}
        if m := os.environ.get(f"{env_name}_MODEL"):      patch["model"] = m
        if t := os.environ.get(f"{env_name}_THINKING"):   patch["thinking_enabled"] = t.lower() in ("1","true","yes")
        if e := os.environ.get(f"{env_name}_EMOJI"):      patch["emoji"] = e
        if patch: overrides[agent_name] = patch
    return overrides


# ── Layer 3: File (written by API/UI) ─────────────────────────────────────────

def _load_file() -> dict[str, Any]:
    try:
        if AGENTS_CONFIG_PATH.exists():
            return json.loads(AGENTS_CONFIG_PATH.read_text()) or {}
    except Exception as e:
        log.warning("agents_config.load_failed error=%s", e)
    return {}


def _save_file(data: dict[str, Any]) -> None:
    AGENTS_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    AGENTS_CONFIG_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False))


# ── Resolution ────────────────────────────────────────────────────────────────

def get_agent_configs() -> dict[str, AgentConfig]:
    global _resolved, _dirty
    if _resolved is not None and not _dirty:
        return _resolved

    defaults  = _code_defaults()
    env_over  = _env_overrides()
    file_data = _load_file()

    resolved: dict[str, AgentConfig] = {}

    # Built-in agents: code defaults → env override → file override
    for name, base in defaults.items():
        merged = deepcopy(base)
        merged.update(env_over.get(name, {}))
        file_patch = {k: v for k, v in file_data.get(name, {}).items() if not k == "is_custom"}
        merged.update(file_patch)
        resolved[name] = _dict_to_config(name, merged)

    # Custom agents (is_custom=true in file)
    for name, cfg in file_data.items():
        if isinstance(cfg, dict) and cfg.get("is_custom") and name not in defaults:
            resolved[name] = _dict_to_config(name, cfg)

    _resolved = resolved
    _dirty    = False
    log.info("agent_configs.resolved agents=%s", {n: c.model for n, c in resolved.items()})
    return resolved


def _dict_to_config(name: str, d: dict[str, Any]) -> AgentConfig:
    return AgentConfig(
        name                  = d.get("name",  name),
        role                  = d.get("role",  "custom"),
        model                 = d.get("model", settings.default_model),
        description           = d.get("description", ""),
        emoji                 = d.get("emoji", "🤖"),
        personality           = d.get("personality", ""),
        system_prompt         = d.get("system_prompt", ""),
        temperature           = float(d.get("temperature", 1.0)),
        thinking_enabled      = bool(d.get("thinking_enabled", True)),
        thinking_budget_tokens= int(d.get("thinking_budget_tokens", 8000)),
        memory_enabled        = bool(d.get("memory_enabled", True)),
        is_custom             = bool(d.get("is_custom", False)),
    )


# ── CRUD ──────────────────────────────────────────────────────────────────────

def _invalidate():
    global _dirty, _resolved, _built_agents
    _dirty = True
    _resolved = None
    _built_agents = None


def update_agent_config(name: str, patch: dict[str, Any]) -> AgentConfig:
    """Update a built-in agent's override or a custom agent's full config."""
    allowed = {
        "name","model","description","emoji","personality","system_prompt",
        "temperature","thinking_enabled","thinking_budget_tokens","memory_enabled",
    }
    safe = {k: v for k, v in patch.items() if k in allowed}
    if not safe:
        raise ValueError(f"No valid fields. Allowed: {allowed}")
    data = _load_file()
    data.setdefault(name, {}).update(safe)
    _save_file(data)
    _invalidate()
    return get_agent_configs()[name]


def create_agent(name: str, cfg: dict[str, Any]) -> AgentConfig:
    """Create a new custom agent. name must be unique."""
    configs = get_agent_configs()
    if name in configs:
        raise ValueError(f"Agent '{name}' already exists")
    if not name.replace("_","").replace("-","").isalnum():
        raise ValueError("Agent name must be alphanumeric with _ or - only")
    data = _load_file()
    data[name] = {**cfg, "is_custom": True}
    _save_file(data)
    _invalidate()
    return get_agent_configs()[name]


def delete_agent(name: str) -> None:
    """Delete a custom agent. Raises if name is a built-in."""
    defaults = _code_defaults()
    if name in defaults:
        raise ValueError(f"'{name}' is a built-in agent and cannot be deleted")
    data = _load_file()
    if name in data:
        del data[name]
        _save_file(data)
    _invalidate()


def reset_agent(name: str) -> AgentConfig:
    """Remove all file overrides for name, reverting to env/code defaults."""
    data = _load_file()
    if name in data:
        del data[name]
        _save_file(data)
    _invalidate()
    configs = get_agent_configs()
    if name not in configs:
        raise ValueError(f"Agent '{name}' not found")
    return configs[name]


# ── Builder ───────────────────────────────────────────────────────────────────

_built_agents: dict[str, Any] | None = None


async def build_agents() -> dict[str, Any]:
    global _built_agents, _dirty
    if _built_agents is not None and not _dirty:
        return _built_agents

    from src.tools.search    import web_search_tool, arxiv_tool, fetch_url
    from src.tools.code      import python_repl_tool, bash_tool
    from src.tools.documents import read_file_tool, write_file_tool, format_markdown_tool
    from src.tools.memory_tools import remember_fact_tool, recall_tool, link_concepts_tool
    from src.tools.mcp_tools import get_tools_for_agent

    tool_registry = {
        "web_search":      web_search_tool,
        "fetch_url":       fetch_url,
        "arxiv_search":    arxiv_tool,
        "python_repl":     python_repl_tool,
        "bash_exec":       bash_tool,
        "read_file":       read_file_tool,
        "write_file":      write_file_tool,
        "format_markdown": format_markdown_tool,
        "remember_fact":   remember_fact_tool,
        "recall":          recall_tool,
        "link_concepts":   link_concepts_tool,
    }

    memory_tools = [remember_fact_tool, recall_tool, link_concepts_tool]

    # Role → default tool set for built-in agents
    role_tools: dict[str, list] = {
        "research":     [web_search_tool, fetch_url, arxiv_tool] + memory_tools,
        "orchestrator": [],
        "code":         [python_repl_tool, bash_tool, read_file_tool, write_file_tool] + memory_tools,
        "data":         [python_repl_tool, read_file_tool, write_file_tool] + memory_tools,
        "writer":       [read_file_tool, write_file_tool, format_markdown_tool],
        "verifier":     [read_file_tool, recall_tool],
    }

    configs = get_agent_configs()
    built: dict[str, Any] = {}

    for name, cfg in configs.items():
        if cfg.tools:
            # Use explicitly configured tools (custom agents + any overrides)
            tool_list = [tool_registry[t] for t in cfg.tools if t in tool_registry]
            if cfg.memory_enabled and remember_fact_tool not in tool_list:
                tool_list.extend(memory_tools)
        else:
            # Built-in: use role defaults + MCP tools
            tool_list = role_tools.get(cfg.role, []) + await get_tools_for_agent(cfg.role)

        cfg.tools = tool_list
        built[name] = create_specialist_agent(cfg)

    _built_agents = built
    _dirty = False
    log.info("agents.built count=%d", len(built))
    return built


def get_agents() -> dict[str, Any]:
    if _built_agents is None:
        raise RuntimeError("Agents not built — call await build_agents() first")
    return _built_agents
