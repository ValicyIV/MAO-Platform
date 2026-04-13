"""
data_agent.py — Data specialist agent definition.
"""
from __future__ import annotations

from src.agents.base import create_specialist_agent
from src.agents.registry import AGENTS


def build_data_agent():
    return create_specialist_agent(AGENTS["data"])
