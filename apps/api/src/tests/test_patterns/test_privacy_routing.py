"""
test_patterns/test_privacy_routing.py — Tests for EdgeClaw privacy routing (Pattern 9).
"""

from __future__ import annotations

import pytest
from src.agents.base import PrivacyRouter, privacy_router


class TestPrivacyTierClassification:
    """Pattern 9: EdgeClaw privacy routing — content classification."""

    def test_api_key_classified_as_private(self):
        content = "Use api_key=sk-ant-abc123 to authenticate"
        assert privacy_router.classify(content) == "private"

    def test_anthropic_key_classified_as_private(self):
        assert privacy_router.classify("key: sk-ant-api03-xyz") == "private"

    def test_credit_card_classified_as_private(self):
        assert privacy_router.classify("card: 4111 1111 1111 1111") == "private"

    def test_ssn_classified_as_private(self):
        assert privacy_router.classify("SSN: 123-45-6789") == "private"

    def test_email_classified_as_sensitive(self):
        # Emails are sensitive but not private
        content = "Contact user@example.com for details"
        tier = privacy_router.classify(content)
        assert tier == "sensitive"

    def test_ip_address_classified_as_sensitive(self):
        content = "Server is at 192.168.1.100"
        assert privacy_router.classify(content) == "sensitive"

    def test_generic_text_classified_as_safe(self):
        content = "Research quantum computing advancements in 2024"
        assert privacy_router.classify(content) == "safe"

    def test_sanitize_strips_api_key(self):
        content = "Use this key: sk-ant-api03-supersecret123"
        sanitized = privacy_router.sanitize(content, "private")
        assert "sk-ant" not in sanitized
        assert "[REDACTED]" in sanitized

    def test_sanitize_preserves_non_sensitive(self):
        content = "Analyse market trends for Q3"
        result = privacy_router.sanitize(content, "safe")
        assert result == content


"""
test_patterns/test_memory_consolidation.py — Tests for memory consolidation (Pattern 8).
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_consolidation_calls_all_three_stages(mock_memory_graph):
    """Pattern 8: three-stage consolidation pipeline."""
    with (
        patch("src.persistence.memory_store.memory_store") as mock_store,
        patch("src.persistence.knowledge_graph.knowledge_graph", mock_memory_graph),
        patch("src.persistence.memory_consolidator.MemoryConsolidator._update_hot_cache",
              new_callable=AsyncMock) as mock_hot,
        patch("src.persistence.memory_consolidator.MemoryConsolidator._update_procedural",
              new_callable=AsyncMock) as mock_proc,
    ):
        mock_store.load_recent_episodes = AsyncMock(return_value=[
            {"entry_type": "llm_call", "content": "Task: research quantum computing. Result: found papers."}
        ])

        from src.persistence.memory_consolidator import MemoryConsolidator
        consolidator = MemoryConsolidator()
        await consolidator.consolidate("research_agent")

        # All three stages should have been called
        mock_hot.assert_called_once()
        mock_memory_graph.add_memories.assert_called_once()
        mock_proc.assert_called_once()


@pytest.mark.asyncio
async def test_consolidation_skips_with_no_episodes(mock_memory_graph):
    """No episodes → nothing to consolidate."""
    with patch("src.persistence.memory_store.memory_store") as mock_store:
        mock_store.load_recent_episodes = AsyncMock(return_value=[])

        from src.persistence.memory_consolidator import MemoryConsolidator
        consolidator = MemoryConsolidator()
        result = await consolidator.consolidate("research_agent")
        assert result["episodes_processed"] == 0
        mock_memory_graph.add_memories.assert_not_called()
