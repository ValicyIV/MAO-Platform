"""
Agent factory — create_specialist_agent.
Implements Pattern 2 (cache boundary), Pattern 9 (privacy routing).
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from typing import Any
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from src.config.settings import settings
from src.observability.langfuse_handler import get_handler

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    agent_id: str
    role: str
    model: str = ""
    tools: list[Any] = None
    temperature: float = 0.0
    thinking_enabled: bool = True
    thinking_budget: int = 8000
    memory_enabled: bool = True

    def __post_init__(self) -> None:
        if self.tools is None:
            self.tools = []
        if not self.model:
            self.model = settings.default_model


def create_specialist_agent(config: AgentConfig) -> Any:
    """
    Factory: compile a specialist ReAct agent with:
    - Extended thinking (if enabled)
    - Langfuse callback
    - Memory tools injected
    - Privacy router applied at invocation time
    """
    from src.tools.memory_tools import get_memory_tools

    all_tools = list(config.tools)
    if config.memory_enabled:
        all_tools.extend(get_memory_tools(config.agent_id))

    model_kwargs: dict[str, Any] = {}
    if settings.extended_thinking_enabled and config.thinking_enabled:
        model_kwargs["thinking"] = {
            "type": "enabled",
            "budget_tokens": config.thinking_budget,
        }

    model = ChatAnthropic(
        model=config.model,
        anthropic_api_key=settings.anthropic_api_key,
        temperature=config.temperature,
        **model_kwargs,
    )

    agent = create_react_agent(
        model=model,
        tools=all_tools,
        prompt=None,  # injected dynamically via state["memory_context"]
    )

    logger.info("Agent %s created (model=%s, tools=%d)", config.agent_id, config.model, len(all_tools))
    return agent
