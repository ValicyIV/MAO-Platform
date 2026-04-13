"""
agents/base.py — Agent factory.

Implements Pattern 2 (cache boundary), Pattern 9 (privacy routing).
Uses model_router.get_chat_model() — provider-agnostic (Anthropic / OpenRouter / Ollama).
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from langgraph.prebuilt import create_react_agent

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Cache boundary marker — everything below this in the prompt is dynamic (not cached)
CACHE_BOUNDARY = "<cache_boundary/>"

# ── Privacy routing (Pattern 9) ───────────────────────────────────────────────

_PRIVATE_PATTERNS = [
    r"(?i)(password|passwd|secret|api[-_]?key|token|bearer)\s*[:=]\s*\S+",
    r"(?i)sk-[a-zA-Z0-9-]+",
    r"(?i)sk-ant-[a-zA-Z0-9-]+",
    r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b",
    r"\b\d{3}-\d{2}-\d{4}\b",
]
_SENSITIVE_PATTERNS = [
    r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
    r"(?i)(internal|confidential|proprietary)",
]


class PrivacyRouter:
    def classify(self, content: str) -> str:
        for p in _PRIVATE_PATTERNS:
            if re.search(p, content):
                return "private"
        if not settings.privacy_routing_enabled:
            return "safe"
        for p in _SENSITIVE_PATTERNS:
            if re.search(p, content, re.IGNORECASE):
                return "sensitive"
        return "safe"

    def sanitize(self, content: str, tier: str) -> str:
        if tier == "private":
            for p in _PRIVATE_PATTERNS:
                content = re.sub(p, "[REDACTED]", content)
            logger.warning("privacy.private_data_stripped")
        return content


privacy_router = PrivacyRouter()


# ── Agent config ──────────────────────────────────────────────────────────────

@dataclass
class AgentConfig:
    name:               str
    role:               str
    model:              str       = ""
    description:        str       = ""
    emoji:              str       = "🤖"
    # personality: injected at the top of the system prompt, above tools/instructions
    personality:        str       = ""
    # system_prompt: if set, fully replaces the role-based prompt from prompts.py
    system_prompt:      str       = ""
    tools:              list[Any] = field(default_factory=list)
    temperature:        float     = 1.0
    thinking_enabled:   bool      = True
    thinking_budget_tokens: int   = 8000
    memory_enabled:     bool      = True
    is_custom:          bool      = False   # True = created via UI, not a built-in

    def __post_init__(self) -> None:
        if not self.model:
            self.model = settings.default_model


# ── Factory ───────────────────────────────────────────────────────────────────

def create_specialist_agent(config: AgentConfig) -> Any:
    """
    Compile a specialist ReAct agent.

    - Model is resolved via model_router — works with Anthropic, OpenRouter, Ollama
    - Extended thinking only activates when provider supports it (Anthropic)
    - Langfuse callback attached if configured
    - Memory tools injected for memory-enabled agents
    """
    from src.agents.model_router import get_chat_model, provider_supports_thinking
    from src.tools.memory_tools import link_concepts_tool, recall_tool, remember_fact_tool

    # Resolve model via router — provider-agnostic
    thinking_budget = (
        config.thinking_budget_tokens
        if config.thinking_enabled and provider_supports_thinking(config.model)
        else None
    )

    llm = get_chat_model(
        model_id               = config.model,
        temperature            = config.temperature,
        streaming              = True,
        thinking_budget_tokens = thinking_budget,
    )

    # Assemble tool list
    all_tools = list(config.tools)
    if config.memory_enabled:
        all_tools.extend([remember_fact_tool, recall_tool, link_concepts_tool])

    # Langfuse callback
    callbacks = []
    if settings.langfuse_enabled:
        from src.observability.langfuse_handler import get_handler
        callbacks.append(get_handler())

    # Build system prompt — personality + role prompt, or full override
    from src.config.prompts import get_prompt
    if config.system_prompt:
        prompt = config.system_prompt
    else:
        role_prompt = get_prompt(config.role)
        if config.personality:
            prompt = f"{config.personality}\n\n{role_prompt}"
        else:
            prompt = role_prompt

    agent = create_react_agent(
        model=llm,
        tools=all_tools,
        prompt=prompt if prompt else None,
    )

    logger.info(
        "agent.created name=%s model=%s tools=%d thinking=%s",
        config.name, config.model, len(all_tools),
        "yes" if thinking_budget else "no",
    )
    return agent
