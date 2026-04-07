"""
agents/registry.py — Agent registry (Pattern 3: explicit model routing).

get_agent_configs() is the single source of truth for all agent configs.
To change any agent's model, edit ONE line here — the model_router handles
the rest (Anthropic / OpenRouter / Ollama, all transparently).

Model ID convention
───────────────────
  claude-*                  → Anthropic   (ANTHROPIC_API_KEY)
  ollama/<name>          → Ollama      (OLLAMA_BASE_URL)
  ollama/<name>:<tag>    → Ollama      (OLLAMA_BASE_URL)
  <org>/<model>             → OpenRouter  (OPENROUTER_API_KEY)

Example OpenRouter models: openai/gpt-4o, google/gemini-2.0-flash-exp,
  meta-llama/llama-3.1-70b-instruct, mistralai/mistral-large

Example Ollama models: ollama/llama3.2, ollama/qwen2.5-coder:7b,
  ollama/mistral:7b, ollama/phi4, ollama/deepseek-r1:8b
"""
from __future__ import annotations

import logging
from typing import Any

from src.agents.base import AgentConfig, create_specialist_agent
from src.config.settings import settings

logger = logging.getLogger(__name__)

_built_agents: dict[str, Any] | None = None


def get_agent_configs() -> dict[str, AgentConfig]:
    """
    Return AgentConfig objects for all registered specialists.

    To swap any agent to a different model/provider, change the `model` field.
    Everything else (tool binding, memory injection, privacy routing) is
    handled by create_specialist_agent() and model_router.get_chat_model().
    """
    return {
        # ── Orchestrator ─────────────────────────────────────────────────────
        # Needs the strongest model — it plans, delegates, and assesses completion.
        # Swap to a capable OpenRouter model if you don't have Anthropic access:
        #   model="openai/gpt-4o"
        #   model="google/gemini-2.0-flash-exp"
        "supervisor": AgentConfig(
            agent_id="supervisor",
            role="orchestrator",
            model="claude-opus-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=10000,
            memory_enabled=True,
        ),

        # ── Research ─────────────────────────────────────────────────────────
        # Searches the web, reads documents, summarises findings.
        # Good OpenRouter alternatives: openai/gpt-4o, google/gemini-2.0-flash-exp
        # Good local alternatives:      ollama/llama3.2, ollama/phi4
        "research": AgentConfig(
            agent_id="research_agent",
            role="research",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),

        # ── Code ─────────────────────────────────────────────────────────────
        # Writes, executes, and debugs code.
        # Good OpenRouter alternatives: openai/gpt-4o, anthropic/claude-opus-4
        # Good local alternatives:      ollama/qwen2.5-coder:7b, ollama/deepseek-coder-v2
        "code": AgentConfig(
            agent_id="code_agent",
            role="code",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),

        # ── Data ─────────────────────────────────────────────────────────────
        # Analyses data, runs queries, generates visualisations.
        # Good OpenRouter alternatives: openai/gpt-4o, google/gemini-1.5-pro
        # Good local alternatives:      ollama/llama3.2, ollama/qwen2.5:14b
        "data": AgentConfig(
            agent_id="data_agent",
            role="data",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),

        # ── Writer ───────────────────────────────────────────────────────────
        # Composes documents, edits prose. No extended thinking needed.
        # Good OpenRouter alternatives: openai/gpt-4o, mistralai/mistral-large
        # Good local alternatives:      ollama/mistral:7b, ollama/llama3.2
        "writer": AgentConfig(
            agent_id="writer_agent",
            role="writer",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=False,
            thinking_budget=0,
        ),

        # ── Verifier (Pattern 4) ─────────────────────────────────────────────
        # Adversarial reviewer — find errors, not confirm success.
        # Needs a capable model. Avoid weak local models for this role.
        "verifier": AgentConfig(
            agent_id="verifier_agent",
            role="verifier",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=4000,
            memory_enabled=False,
        ),
    }


# ── Wiring ────────────────────────────────────────────────────────────────────

async def build_agents() -> dict[str, Any]:
    """Build and cache all compiled agents. Called once in main.py lifespan."""
    global _built_agents
    if _built_agents is not None:
        return _built_agents

    from src.tools.search import web_search_tool, arxiv_tool, fetch_url
    from src.tools.code import python_repl_tool, bash_tool
    from src.tools.documents import read_file_tool, write_file_tool, format_markdown_tool
    from src.tools.memory_tools import remember_fact_tool, recall_tool, link_concepts_tool
    from src.tools.mcp_tools import get_tools_for_agent

    configs = get_agent_configs()

    # Assign tool lists per role
    memory_tools = [remember_fact_tool, recall_tool, link_concepts_tool]

    configs["research"].tools = (
        [web_search_tool, fetch_url, arxiv_tool] + memory_tools
        + await get_tools_for_agent("research")
    )
    configs["code"].tools = (
        [python_repl_tool, bash_tool, read_file_tool, write_file_tool] + memory_tools
        + await get_tools_for_agent("code")
    )
    configs["data"].tools = (
        [python_repl_tool, read_file_tool, write_file_tool] + memory_tools
        + await get_tools_for_agent("data")
    )
    configs["writer"].tools = (
        [read_file_tool, write_file_tool, format_markdown_tool]
        + await get_tools_for_agent("writer")
    )
    configs["verifier"].tools = [read_file_tool, recall_tool]

    _built_agents = {name: create_specialist_agent(cfg) for name, cfg in configs.items()}
    logger.info(
        "Built %d agents: %s",
        len(_built_agents),
        {n: c.model for n, c in configs.items()},
    )
    return _built_agents


def get_agents() -> dict[str, Any]:
    """Return cached agents (must call build_agents() at startup first)."""
    if _built_agents is None:
        raise RuntimeError("Agents not initialised — call await build_agents() at startup")
    return _built_agents
