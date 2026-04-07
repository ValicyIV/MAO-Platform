"""
documents.py — File read/write and markdown formatting tools.

Paths are sandboxed to the workspace directory (./workspace/).
Agents cannot read/write outside this directory.
"""

from __future__ import annotations

from pathlib import Path

import structlog
from langchain_core.tools import tool

log = structlog.get_logger(__name__)

WORKSPACE = Path("./workspace")
WORKSPACE.mkdir(exist_ok=True)
MAX_READ = 50_000  # chars


def _safe_path(filename: str) -> Path:
    """Resolve path inside workspace, raising ValueError if outside."""
    resolved = (WORKSPACE / filename).resolve()
    if not str(resolved).startswith(str(WORKSPACE.resolve())):
        raise ValueError(f"Path traversal blocked: {filename!r}")
    return resolved


@tool
async def read_file_tool(filename: str) -> str:
    """
    Read a file from the workspace directory.

    Args:
        filename: Relative file path within the workspace.

    Returns:
        File contents as text (max 50,000 chars).
    """
    try:
        path = _safe_path(filename)
        if not path.exists():
            return f"File not found: {filename}"
        text = path.read_text(encoding="utf-8", errors="replace")
        if len(text) > MAX_READ:
            text = text[:MAX_READ] + f"\n... (truncated at {MAX_READ} chars)"
        return text
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Read error: {e!s}"


@tool
async def write_file_tool(filename: str, content: str) -> str:
    """
    Write content to a file in the workspace directory.
    Creates parent directories automatically.

    Args:
        filename: Relative file path within the workspace.
        content:  Text content to write.

    Returns:
        Confirmation message with file path and byte count.
    """
    try:
        path = _safe_path(filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        log.info("file.written", path=str(path), bytes=len(content.encode()))
        return f"Written {len(content)} chars to {filename}"
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Write error: {e!s}"


@tool
async def format_markdown_tool(text: str, style: str = "standard") -> str:
    """
    Format or clean up markdown text.
    Styles: 'standard' (default), 'compact' (remove extra whitespace),
    'headers' (normalise heading levels).

    Args:
        text:  Markdown text to format.
        style: Formatting style to apply.

    Returns:
        Formatted markdown text.
    """
    import re

    if style == "compact":
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" +", " ", text)
    elif style == "headers":
        # Normalise all ATX headers to use proper spacing
        text = re.sub(r"^(#{1,6})([^ #])", r"\1 \2", text, flags=re.MULTILINE)
    else:
        # Standard: ensure blank lines around headers and code blocks
        text = re.sub(r"\n(#{1,6} )", r"\n\n\1", text)
        text = re.sub(r"\n(```)", r"\n\n\1", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
