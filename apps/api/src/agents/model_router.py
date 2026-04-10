"""
agents/model_router.py — Unified model router.

Detects the correct provider from the model ID string and returns
a LangChain BaseChatModel. The rest of the codebase calls get_chat_model()
and stays completely provider-agnostic.

Model ID convention
───────────────────
  claude-*                     → Anthropic        (e.g. claude-sonnet-4-6)
  ollama/<name>                → Ollama local      (e.g. ollama/llama3.2)
  ollama/<name>:<tag>          → Ollama local      (e.g. ollama/mistral:7b)
  <org>/<model>                → OpenRouter cloud  (e.g. openai/gpt-4o)
  <anything else with a />     → OpenRouter cloud  (e.g. google/gemini-2.0-flash-exp)

Environment variables
─────────────────────
  ANTHROPIC_API_KEY            required for claude-* models
  OPENROUTER_API_KEY           required for OpenRouter models
  OLLAMA_BASE_URL              optional, default http://localhost:11434

Capabilities by provider
────────────────────────
  Extended thinking  → Anthropic only (claude-3-7-sonnet and later)
  Streaming          → All providers
  Tool use           → All providers (Anthropic, OpenRouter, Ollama via tools)
  JSON mode          → All providers (via prompt engineering if not native)

Adding a new provider
─────────────────────
  1. Add a new elif branch in detect_provider()
  2. Add the LangChain model construction in get_chat_model()
  3. Update PROVIDER_CAPS if the provider has special capabilities
  Done. No other files need to change.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

import structlog
from langchain_core.language_models import BaseChatModel

from src.config.settings import settings

log = structlog.get_logger(__name__)


# ── Provider enum ─────────────────────────────────────────────────────────────

class ModelProvider(str, Enum):
    ANTHROPIC   = "anthropic"
    OPENROUTER  = "openrouter"
    OLLAMA      = "ollama"


# ── Provider capabilities ─────────────────────────────────────────────────────

@dataclass
class ProviderCaps:
    streaming:          bool = True
    tool_use:           bool = True
    extended_thinking:  bool = False   # Anthropic-only as of 2026
    json_mode:          bool = False   # native JSON mode (not prompt-based)
    vision:             bool = False

PROVIDER_CAPS: dict[ModelProvider, ProviderCaps] = {
    ModelProvider.ANTHROPIC:  ProviderCaps(extended_thinking=True, vision=True),
    ModelProvider.OPENROUTER: ProviderCaps(vision=True),   # varies by model
    ModelProvider.OLLAMA:     ProviderCaps(),
}


# ── Detection ─────────────────────────────────────────────────────────────────

def detect_provider(model_id: str) -> ModelProvider:
    """
    Infer the provider from the model ID string.

    >>> detect_provider("claude-sonnet-4-6")
    <ModelProvider.ANTHROPIC: 'anthropic'>
    >>> detect_provider("ollama/llama3.2")
    <ModelProvider.OLLAMA: 'ollama'>
    >>> detect_provider("openai/gpt-4o")
    <ModelProvider.OPENROUTER: 'openrouter'>
    >>> detect_provider("google/gemini-2.0-flash-exp")
    <ModelProvider.OPENROUTER: 'openrouter'>
    """
    if model_id.startswith("claude-"):
        return ModelProvider.ANTHROPIC
    if model_id.startswith("ollama/") or model_id.startswith("ollama:"):
        return ModelProvider.OLLAMA
    # Anything with a slash that isn't ollama/ is an OpenRouter model ID
    # e.g. "openai/gpt-4o", "google/gemini-2.0-flash-exp", "meta-llama/llama-3.1-70b"
    return ModelProvider.OPENROUTER


def provider_supports_thinking(model_id: str) -> bool:
    return detect_provider(model_id) == ModelProvider.ANTHROPIC


# ── Model factory ─────────────────────────────────────────────────────────────

def get_chat_model(
    model_id: str,
    temperature: float = 1.0,
    streaming: bool = True,
    thinking_budget_tokens: int | None = None,
    extra_kwargs: dict[str, Any] | None = None,
) -> BaseChatModel:
    """
    Return the correct LangChain BaseChatModel for the given model_id.

    Args:
        model_id:              Full model identifier (see convention above).
        temperature:           Sampling temperature. Must be 1.0 for Anthropic
                               extended thinking.
        streaming:             Enable streaming responses.
        thinking_budget_tokens: If set and provider supports thinking, enables
                               extended thinking mode (Anthropic only).
        extra_kwargs:          Provider-specific kwargs merged into the model call.

    Returns:
        A configured, ready-to-use LangChain chat model.
    """
    provider = detect_provider(model_id)
    kwargs   = extra_kwargs or {}

    log.debug("model_router.creating", model=model_id, provider=provider.value)

    # ── Anthropic ─────────────────────────────────────────────────────────────
    if provider == ModelProvider.ANTHROPIC:
        from langchain_anthropic import ChatAnthropic

        model_kwargs: dict[str, Any] = {
            "model":       model_id,
            "temperature": temperature,
            "streaming":   streaming,
            **kwargs,
        }

        # Extended thinking — Anthropic-only, opt-in
        if (
            thinking_budget_tokens
            and settings.extended_thinking_enabled
            and PROVIDER_CAPS[ModelProvider.ANTHROPIC].extended_thinking
        ):
            model_kwargs["thinking"] = {
                "type":         "enabled",
                "budget_tokens": min(thinking_budget_tokens, settings.thinking_budget_tokens),
            }

        return ChatAnthropic(**model_kwargs)

    # ── Ollama (local) ────────────────────────────────────────────────────────
    elif provider == ModelProvider.OLLAMA:
        from langchain_ollama import ChatOllama

        # Strip "ollama/" or "ollama:" prefix
        clean_id = (
            model_id.removeprefix("ollama/").removeprefix("ollama:")
        )

        return ChatOllama(
            model       = clean_id,
            base_url    = settings.ollama_base_url,
            temperature = temperature,
            **kwargs,
        )

    # ── OpenRouter (cloud, any provider) ─────────────────────────────────────
    else:
        from langchain_openai import ChatOpenAI

        if not settings.openrouter_api_key:
            raise ValueError(
                f"OPENROUTER_API_KEY is not set but model '{model_id}' requires OpenRouter. "
                "Add it to your .env file."
            )

        return ChatOpenAI(
            model       = model_id,
            base_url    = "https://openrouter.ai/api/v1",
            api_key     = settings.openrouter_api_key,
            temperature = temperature,
            streaming   = streaming,
            # OpenRouter best-practice headers
            default_headers={
                "HTTP-Referer": "https://mao-platform.local",
                "X-Title":      "MAO Platform",
            },
            **kwargs,
        )


# ── Convenience wrappers ──────────────────────────────────────────────────────

def get_extraction_model() -> BaseChatModel:
    """
    Return the model used for KG extraction and consolidation.
    Defaults to the cheapest available option — override with
    EXTRACTION_MODEL env var.
    """
    return get_chat_model(
        settings.extraction_model,
        temperature=0.3,   # lower temp for structured extraction
        streaming=False,
    )


def model_display_name(model_id: str) -> str:
    """
    Return a short human-readable display name for the model.

    >>> model_display_name("claude-sonnet-4-6")
    'Sonnet'
    >>> model_display_name("ollama/llama3.2")
    'llama3.2 (local)'
    >>> model_display_name("openai/gpt-4o")
    'GPT-4o'
    >>> model_display_name("google/gemini-2.0-flash-exp")
    'Gemini 2.0 Flash'
    """
    provider = detect_provider(model_id)

    if provider == ModelProvider.ANTHROPIC:
        # claude-sonnet-4-6 → Sonnet, claude-opus-4-6 → Opus, claude-haiku-4-5 → Haiku
        for tier in ("opus", "sonnet", "haiku"):
            if tier in model_id:
                return tier.capitalize()
        return model_id.split("-")[1].capitalize()

    elif provider == ModelProvider.OLLAMA:
        clean = model_id.removeprefix("ollama/").removeprefix("ollama:")
        return f"{clean} (local)"

    else:
        # "openai/gpt-4o" → "GPT-4o"
        # "google/gemini-2.0-flash-exp" → "Gemini 2.0 Flash"
        # "meta-llama/llama-3.1-70b-instruct" → "Llama 3.1 70B"
        name = model_id.split("/", 1)[-1]          # drop org
        name = name.replace("-instruct", "").replace("-chat", "").replace("-preview", "")
        # Replace hyphens with spaces, title-case first word
        parts = name.split("-")
        if parts:
            parts[0] = parts[0].upper() if len(parts[0]) <= 4 else parts[0].capitalize()
        return " ".join(parts).strip()


def model_badge_color(model_id: str) -> str:
    """
    Return a Tailwind color class string for the model badge in the UI.
    Matches the SpecialistNode badge styling.
    """
    provider = detect_provider(model_id)

    if provider == ModelProvider.ANTHROPIC:
        if "opus"   in model_id: return "bg-violet-500/20 text-violet-300 border-violet-500/30"
        if "sonnet" in model_id: return "bg-blue-500/20   text-blue-300   border-blue-500/30"
        if "haiku"  in model_id: return "bg-teal-500/20   text-teal-300   border-teal-500/30"
        return "bg-neutral-700 text-neutral-300 border-neutral-600"

    elif provider == ModelProvider.OLLAMA:
        return "bg-green-500/20 text-green-300 border-green-500/30"

    else:
        # OpenRouter — color by org
        if model_id.startswith("openai/"):   return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        if model_id.startswith("google/"):   return "bg-blue-500/20    text-blue-300    border-blue-500/30"
        if model_id.startswith("meta-llama/"): return "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
        if model_id.startswith("mistralai/"): return "bg-orange-500/20  text-orange-300  border-orange-500/30"
        return "bg-neutral-700 text-neutral-300 border-neutral-600"
