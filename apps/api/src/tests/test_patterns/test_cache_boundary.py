"""
test_patterns/test_cache_boundary.py — Tests for Pattern 2: stable/dynamic
prompt cache boundary.

The cache boundary marker <cache_boundary/> must be present in every
non-orchestrator agent prompt, and all dynamic content must appear below it.
"""

from __future__ import annotations

import pytest

from src.agents.base import CACHE_BOUNDARY
from src.config.prompts import get_prompt

SPECIALIST_ROLES = ["research", "code", "data", "writer", "verifier"]


class TestCacheBoundaryPresence:
    """Every specialist prompt must contain the cache boundary marker."""

    @pytest.mark.parametrize("role", SPECIALIST_ROLES)
    def test_prompt_contains_cache_boundary(self, role: str):
        prompt = get_prompt(role)
        assert CACHE_BOUNDARY in prompt, (
            f"Prompt for role '{role}' is missing cache boundary marker "
            f"'{CACHE_BOUNDARY}'. Without it, dynamic context will be "
            "included in the cached (static) section, invalidating the cache."
        )

    @pytest.mark.parametrize("role", SPECIALIST_ROLES)
    def test_static_section_is_longer_than_dynamic(self, role: str):
        """
        Static section (above boundary) should be substantially longer than
        the dynamic placeholder (below boundary), confirming that most of the
        prompt will benefit from caching.
        """
        prompt = get_prompt(role)
        parts = prompt.split(CACHE_BOUNDARY, 1)
        static_len  = len(parts[0])
        dynamic_len = len(parts[1]) if len(parts) > 1 else 0
        assert static_len > dynamic_len, (
            f"Role '{role}': static section ({static_len} chars) should be "
            f"longer than dynamic section ({dynamic_len} chars)."
        )

    @pytest.mark.parametrize("role", SPECIALIST_ROLES)
    def test_boundary_appears_exactly_once(self, role: str):
        prompt = get_prompt(role)
        count = prompt.count(CACHE_BOUNDARY)
        assert count == 1, (
            f"Role '{role}': expected exactly 1 cache boundary marker, found {count}."
        )


class TestCacheBoundaryContent:
    """The static section must not contain dynamic placeholders."""

    @pytest.mark.parametrize("role", SPECIALIST_ROLES)
    def test_no_curly_braces_in_static_section(self, role: str):
        """
        Curly-brace format strings in the static section indicate dynamic
        content that would break caching by changing every invocation.
        """
        prompt = get_prompt(role)
        static_section = prompt.split(CACHE_BOUNDARY)[0]
        # Allow intentional escaped braces {{}} but flag single-brace templates
        import re
        templates = re.findall(r"(?<!\{)\{[^{}]+\}(?!\})", static_section)
        assert not templates, (
            f"Role '{role}': static section contains template placeholders "
            f"that will break caching: {templates}"
        )
