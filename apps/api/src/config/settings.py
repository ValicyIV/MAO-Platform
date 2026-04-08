"""
Configuration — validated at startup via Pydantic BaseSettings.
All environment variables are declared here with types, defaults, and docs.
Import `settings` as a singleton throughout the application.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Required for Anthropic models ───────────────────────────────────────────
    # Set to "" if you only use OpenRouter or Ollama
    anthropic_api_key: str = Field(default="", description="Anthropic API key")

    # ── OpenRouter (optional — cloud models from any provider) ───────────────
    # Get a free key at https://openrouter.ai — pay per token, no subscription
    openrouter_api_key: str = Field(default="", description="OpenRouter API key")

    # ── Ollama (optional — local models) ────────────────────────────────────
    # Install: https://ollama.ai — runs llama3, mistral, phi-3, etc. locally
    ollama_base_url: str = Field(default="http://localhost:11434", description="Ollama server URL")

    # ── Extraction model (used by knowledge graph consolidation) ────────────
    # Any model ID supported by the router. Cheapest option recommended.
    # Examples: claude-haiku-4-5 | ollama/llama3.2 | openai/gpt-4o-mini
    extraction_model: str = Field(
        default="claude-haiku-4-5",
        description="Model used for KG entity extraction. Pick cheapest available.",
    )

    # ── Langfuse ──────────────────────────────────────────────────────────────
    langfuse_public_key: str = Field(default="", description="Langfuse public key")
    langfuse_secret_key: str = Field(default="", description="Langfuse secret key")
    langfuse_host: str = Field(
        default="http://localhost:3001",
        description="Langfuse host URL",
    )

    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.langfuse_public_key and self.langfuse_secret_key)

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://mao:mao@localhost:5432/mao",
        description="PostgreSQL connection URL (asyncpg)",
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )

    # ── API ───────────────────────────────────────────────────────────────────
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    cors_origins: list[str] = Field(default=["http://localhost:5173"])

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [v]
        return v

    # ── Memory system ─────────────────────────────────────────────────────────
    kuzu_db_path: str = Field(
        default="./data/kuzu/mao.db",
        description="Path to Kuzu embedded graph DB file",
    )
    memory_graph_enabled: bool = Field(default=True)

    # Token budgets for context injection (Pattern 15)
    memory_hot_cache_tokens: int = Field(default=2000)
    memory_semantic_tokens: int = Field(default=500)
    memory_graph_tokens: int = Field(default=800)
    memory_procedural_tokens: int = Field(default=300)
    memory_graph_hops: int = Field(default=2)
    memory_consolidation_batch_days: int = Field(default=7)
    memory_conflict_alert_enabled: bool = Field(default=True)

    # ── Agent behaviour ───────────────────────────────────────────────────────
    default_model: str = Field(default="claude-sonnet-4-6")
    heartbeat_interval: int = Field(
        default=30,
        description="Scheduler heartbeat interval in seconds",
    )
    memory_retention_days: int = Field(
        default=7,
        description="How many days of episode logs to retain",
    )
    privacy_routing_enabled: bool = Field(default=True)
    verification_threshold: int = Field(
        default=3,
        description="Min file edits before triggering verification agent",
    )

    # ── MCP servers ───────────────────────────────────────────────────────────
    github_mcp_url: str = Field(default="")
    postgres_mcp_url: str = Field(default="")

    # ── Feature flags ─────────────────────────────────────────────────────────
    extended_thinking_enabled: bool = Field(default=True)
    thinking_budget_tokens: int = Field(default=8000)
    a2a_enabled: bool = Field(default=False)
    kairos_daemon_enabled: bool = Field(default=False)

    @model_validator(mode="after")
    def validate_at_least_one_provider(self) -> "Settings":
        """Warn at startup if no LLM provider key is configured."""
        if not self.anthropic_api_key and not self.openrouter_api_key:
            import logging
            import urllib.request
            log = logging.getLogger(__name__)
            ollama_reachable = False
            try:
                urllib.request.urlopen(f"{self.ollama_base_url}/api/tags", timeout=2)
                ollama_reachable = True
            except Exception:
                pass
            if not ollama_reachable:
                log.warning(
                    "No LLM provider configured. "
                    "Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or point OLLAMA_BASE_URL "
                    "at a running Ollama instance. See .env.example for details. "
                    "Agent workflows will fail until a provider is configured."
                )
        return self


    @model_validator(mode="after")
    def validate_memory_tokens(self) -> "Settings":
        total = (
            self.memory_hot_cache_tokens
            + self.memory_semantic_tokens
            + self.memory_graph_tokens
            + self.memory_procedural_tokens
        )
        if total > 8000:
            raise ValueError(
                f"Total memory token budget ({total}) exceeds 8000. "
                "Reduce one or more MEMORY_*_TOKENS settings."
            )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings singleton."""
    return Settings()


# Convenience alias — import this throughout the application
settings: Settings = get_settings()
