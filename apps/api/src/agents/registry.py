"""
Agent registry — Pattern 3: explicit model routing.
AGENTS is the single source of truth for all specialist agents.
"""
from __future__ import annotations
import logging
from typing import Any
from src.agents.base import AgentConfig, create_specialist_agent
from src.config.settings import settings

logger = logging.getLogger(__name__)

_built_agents: dict[str, Any] | None = None


def get_agent_configs() -> dict[str, AgentConfig]:
    """Return AgentConfig objects for all registered specialists."""
    return {
        "supervisor": AgentConfig(
            agent_id="supervisor",
            role="orchestrator",
            model="claude-opus-4-6",  # best model for routing decisions
            tools=[],
            thinking_enabled=True,
            thinking_budget=10000,
            memory_enabled=True,
        ),
        "research": AgentConfig(
            agent_id="research_agent",
            role="research",
            model="claude-sonnet-4-6",
            tools=[],  # populated in build_agents()
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),
        "code": AgentConfig(
            agent_id="code_agent",
            role="code",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),
        "data": AgentConfig(
            agent_id="data_agent",
            role="data",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=settings.thinking_budget_tokens,
        ),
        "writer": AgentConfig(
            agent_id="writer_agent",
            role="writer",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=False,  # writer rarely needs deep reasoning
            thinking_budget=0,
        ),
        "verifier": AgentConfig(
            agent_id="verifier_agent",
            role="verifier",
            model="claude-sonnet-4-6",
            tools=[],
            thinking_enabled=True,
            thinking_budget=4000,
            memory_enabled=False,  # verifier needs clean perspective
        ),
    }


async def build_agents() -> dict[str, Any]:
    """Build and cache all compiled agents. Call once at startup."""
    global _built_agents
    if _built_agents is not None:
        return _built_agents

    from src.tools.search import get_search_tools
    from src.tools.code import get_code_tools
    from src.tools.data import get_data_tools
    from src.tools.documents import get_document_tools
    from src.tools.mcp_tools import get_tools_for_agent

    configs = get_agent_configs()

    # Assign tools per role
    configs["research"].tools = get_search_tools() + await get_tools_for_agent("research")
    configs["code"].tools = get_code_tools() + await get_tools_for_agent("code")
    configs["data"].tools = get_data_tools() + await get_tools_for_agent("data")
    configs["writer"].tools = get_document_tools()

    _built_agents = {name: create_specialist_agent(cfg) for name, cfg in configs.items()}
    logger.info("Built %d agents", len(_built_agents))
    return _built_agents


def get_agents() -> dict[str, Any]:
    """Return cached agents (must call build_agents() first)."""
    if _built_agents is None:
        raise RuntimeError("Agents not built — call build_agents() at startup")
    return _built_agents
