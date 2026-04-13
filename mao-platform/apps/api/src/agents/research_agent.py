"""
research_agent.py — Research specialist agent definition.

Thin wrapper that pulls config from the registry and uses the base factory.
The real configuration lives in registry.py — this file exists for
explicitness and to allow per-agent prompt or tool customisation later.
"""

from __future__ import annotations

from src.agents.base import create_specialist_agent
from src.agents.registry import AGENTS


def build_research_agent():
    """Return a compiled research agent from the registry config."""
    config = AGENTS["research"]
    return create_specialist_agent(config)
