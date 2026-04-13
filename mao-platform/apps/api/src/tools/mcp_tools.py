"""
mcp_tools.py — MCP (Model Context Protocol) client manager.

Manages connections to multiple MCP servers. Tool lists are filtered
per agent role so each agent only sees tools it is permitted to use.

Server transports:
  - stdio: local servers (filesystem, git)
  - http:  remote servers (GitHub, Postgres, custom)
"""

from __future__ import annotations

from typing import Any

import structlog
from langchain_core.tools import BaseTool

from src.config.settings import settings

log = structlog.get_logger(__name__)

# ── Server permission map ─────────────────────────────────────────────────────

AGENT_TOOL_PERMISSIONS: dict[str, list[str]] = {
    "supervisor": [],
    "orchestrator": [],
    "research":     ["filesystem_read", "github_search"],
    "code":         ["filesystem_read", "filesystem_write", "github_search", "github_repo"],
    "data":         ["postgres_query", "filesystem_read"],
    "writer":       ["filesystem_read", "filesystem_write"],
    "verifier":     ["filesystem_read"],
    "consolidator": [],
}

# ── Module-level state ────────────────────────────────────────────────────────

_client: Any | None = None
_all_tools: list[BaseTool] = []


async def init_mcp_client() -> None:
    """Initialise MCP connections. Called once in main.py lifespan."""
    global _client, _all_tools

    server_configs: dict[str, Any] = {}

    # Filesystem MCP (stdio transport — always available if npx is installed)
    server_configs["filesystem"] = {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "./workspace"],
        "transport": "stdio",
    }

    # Optional remote MCP servers from settings
    if settings.github_mcp_url:
        server_configs["github"] = {
            "url": settings.github_mcp_url,
            "transport": "http",
        }

    if settings.postgres_mcp_url:
        server_configs["postgres"] = {
            "url": settings.postgres_mcp_url,
            "transport": "http",
        }

    if not server_configs:
        log.info("mcp.no_servers_configured")
        return

    try:
        from langchain_mcp_adapters.client import MultiServerMCPClient
        _client = MultiServerMCPClient(server_configs)
        _all_tools = await _client.get_tools()
        log.info("mcp.connected", servers=list(server_configs.keys()), tools=len(_all_tools))
    except ImportError:
        log.warning("mcp.client_unavailable", reason="langchain-mcp-adapters not installed")
    except Exception as e:
        log.warning("mcp.connection_failed", error=str(e))
        # Non-fatal — agents will just not have MCP tools


async def close_mcp_client() -> None:
    """Close all MCP connections. Called in main.py lifespan shutdown."""
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:
            pass
        _client = None
    log.info("mcp.disconnected")


def get_tools_for_agent(role: str) -> list[BaseTool]:
    """
    Return the filtered MCP tool list for a given agent role.
    Returns empty list if MCP is not connected.
    """
    if not _all_tools:
        return []

    allowed_prefixes = AGENT_TOOL_PERMISSIONS.get(role, [])
    if not allowed_prefixes:
        return []

    filtered = []
    for tool in _all_tools:
        tool_name = getattr(tool, "name", "")
        for prefix in allowed_prefixes:
            if tool_name.startswith(prefix.replace("_", "-")) or tool_name.startswith(prefix):
                filtered.append(tool)
                break

    return filtered
