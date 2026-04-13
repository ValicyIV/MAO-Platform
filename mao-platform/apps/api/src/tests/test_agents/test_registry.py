"""
test_agents/test_registry.py — Tests for the agent registry and config validation.
"""

from __future__ import annotations

from src.agents.registry import AGENTS, AgentConfig

REQUIRED_SPECIALISTS = {"research", "code", "data", "writer", "supervisor", "verifier"}


class TestAgentRegistry:
    def test_all_required_agents_present(self):
        assert REQUIRED_SPECIALISTS.issubset(set(AGENTS.keys()))

    def test_all_configs_are_agent_config_instances(self):
        for name, config in AGENTS.items():
            assert isinstance(config, AgentConfig), (
                f"Registry entry '{name}' is not an AgentConfig"
            )

    def test_all_agents_have_non_empty_name(self):
        for name, config in AGENTS.items():
            assert config.name.strip(), f"Agent '{name}' has empty name"

    def test_supervisor_uses_opus(self):
        """Supervisor prefers Opus, but may fall back when cloud keys are missing."""
        model = AGENTS["supervisor"].model.lower()
        assert "opus" in model or model.startswith("openai/") or model.startswith("ollama/")

    def test_specialists_use_sonnet(self):
        """Specialists prefer Sonnet, with provider fallback when unavailable."""
        for role in ("research", "code", "data", "writer"):
            model = AGENTS[role].model.lower()
            assert "sonnet" in model or model.startswith("openai/") or model.startswith("ollama/"), (
                f"Specialist '{role}' should use Sonnet or provider fallback, got: {AGENTS[role].model}"
            )

    def test_consolidator_uses_haiku(self):
        """Consolidator prefers Haiku, with cheaper provider fallback allowed."""
        model = AGENTS["consolidator"].model.lower()
        assert "haiku" in model or model.startswith("openai/") or model.startswith("ollama/")

    def test_all_agents_have_at_least_one_tool(self):
        """Every non-orchestrator agent needs at least one tool."""
        orchestrators = {"supervisor", "consolidator"}
        for name, config in AGENTS.items():
            if name not in orchestrators:
                assert config.tools, f"Agent '{name}' has no tools"

    def test_memory_tools_present_in_specialists(self):
        """Specialist agents should have memory tools (Pattern 14/15)."""
        memory_tools = {"remember_fact", "recall"}
        for role in ("research", "code", "data", "writer"):
            agent_tools = set(AGENTS[role].tools)
            assert memory_tools & agent_tools, (
                f"Agent '{role}' is missing memory tools. "
                f"Has: {agent_tools}, expected at least one of {memory_tools}"
            )

    def test_verifier_has_restricted_tools(self):
        """Verifier should only read — no write tools (Pattern 4)."""
        verifier_tools = set(AGENTS["verifier"].tools)
        write_tools = {"write_file", "bash_exec", "python_repl", "sql_query"}
        overlap = verifier_tools & write_tools
        assert not overlap, (
            f"Verifier has write tools it shouldn't: {overlap}"
        )

    def test_temperature_is_1_for_thinking_agents(self):
        """Anthropic requires temperature=1 when using extended thinking."""
        for name, config in AGENTS.items():
            if config.thinking_enabled:
                assert config.temperature == 1.0, (
                    f"Agent '{name}' has thinking_enabled=True but "
                    f"temperature={config.temperature} (must be 1.0)"
                )
