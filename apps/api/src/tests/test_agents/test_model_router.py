"""
test_agents/test_model_router.py — Unit tests for the model router.

Pure logic tests — no LLM calls, no network. Tests provider detection,
display name formatting, badge colours, and capability flags.
"""

from __future__ import annotations

import pytest

from src.agents.model_router import (
    ModelProvider,
    detect_provider,
    model_display_name,
    model_badge_color,
    provider_supports_thinking,
    PROVIDER_CAPS,
)


# ── Provider detection ────────────────────────────────────────────────────────

class TestDetectProvider:

    @pytest.mark.parametrize("model_id,expected", [
        ("claude-sonnet-4-6",                ModelProvider.ANTHROPIC),
        ("claude-opus-4-6",                  ModelProvider.ANTHROPIC),
        ("claude-haiku-4-5",                 ModelProvider.ANTHROPIC),
        ("ollama/llama3.2",                  ModelProvider.OLLAMA),
        ("ollama/mistral:7b",                ModelProvider.OLLAMA),
        ("ollama/phi4",                      ModelProvider.OLLAMA),
        ("openai/gpt-4o",                    ModelProvider.OPENROUTER),
        ("openai/gpt-4o-mini",               ModelProvider.OPENROUTER),
        ("google/gemini-2.0-flash-exp",      ModelProvider.OPENROUTER),
        ("meta-llama/llama-3.3-70b-instruct",ModelProvider.OPENROUTER),
        ("mistralai/mistral-large",          ModelProvider.OPENROUTER),
        ("anthropic/claude-3-5-sonnet",      ModelProvider.OPENROUTER),  # via OpenRouter
    ])
    def test_detection(self, model_id: str, expected: ModelProvider):
        assert detect_provider(model_id) == expected, (
            f"Expected {expected.value} for '{model_id}'"
        )


# ── Thinking support ──────────────────────────────────────────────────────────

class TestThinkingSupport:

    def test_anthropic_supports_thinking(self):
        assert provider_supports_thinking("claude-sonnet-4-6") is True
        assert provider_supports_thinking("claude-opus-4-6")   is True

    def test_openrouter_no_thinking(self):
        assert provider_supports_thinking("openai/gpt-4o") is False

    def test_ollama_no_thinking(self):
        assert provider_supports_thinking("ollama/llama3.2") is False

    def test_caps_registry_consistent(self):
        assert PROVIDER_CAPS[ModelProvider.ANTHROPIC].extended_thinking is True
        assert PROVIDER_CAPS[ModelProvider.OPENROUTER].extended_thinking is False
        assert PROVIDER_CAPS[ModelProvider.OLLAMA].extended_thinking is False


# ── Display names ─────────────────────────────────────────────────────────────

class TestDisplayNames:

    @pytest.mark.parametrize("model_id,expected", [
        ("claude-sonnet-4-6",                 "Sonnet"),
        ("claude-opus-4-6",                   "Opus"),
        ("claude-haiku-4-5",                  "Haiku"),
        ("ollama/llama3.2",                   "llama3.2 (local)"),
        ("ollama/mistral:7b",                 "mistral:7b (local)"),
    ])
    def test_known_display_names(self, model_id: str, expected: str):
        assert model_display_name(model_id) == expected

    def test_openrouter_drops_instruct_suffix(self):
        name = model_display_name("meta-llama/llama-3.3-70b-instruct")
        assert "instruct" not in name.lower()

    def test_openrouter_name_is_non_empty(self):
        for model_id in ("openai/gpt-4o", "google/gemini-2.0-flash-exp", "mistralai/mistral-large"):
            assert model_display_name(model_id), f"Empty name for '{model_id}'"


# ── Badge colours ─────────────────────────────────────────────────────────────

class TestBadgeColors:

    def test_anthropic_opus_is_violet(self):
        assert "violet" in model_badge_color("claude-opus-4-6")

    def test_anthropic_sonnet_is_blue(self):
        assert "blue" in model_badge_color("claude-sonnet-4-6")

    def test_anthropic_haiku_is_teal(self):
        assert "teal" in model_badge_color("claude-haiku-4-5")

    def test_ollama_is_green(self):
        assert "green" in model_badge_color("ollama/llama3.2")

    def test_openai_via_openrouter_is_emerald(self):
        assert "emerald" in model_badge_color("openai/gpt-4o")

    def test_all_colors_are_non_empty(self):
        models = [
            "claude-sonnet-4-6", "ollama/llama3.2",
            "openai/gpt-4o", "google/gemini-2.0-flash-exp",
            "meta-llama/llama-3.3-70b-instruct",
        ]
        for m in models:
            color = model_badge_color(m)
            assert color and len(color) > 5, f"Empty color for '{m}'"
