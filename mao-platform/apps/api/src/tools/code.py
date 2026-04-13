"""
code.py — Code execution tools: Python REPL and bash executor.

Both tools run in a restricted subprocess with timeout enforcement.
Never expose these tools to agents that shouldn't have shell access.
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
from pathlib import Path

import structlog
from langchain_core.tools import tool

log = structlog.get_logger(__name__)

EXEC_TIMEOUT = 30      # seconds
MAX_OUTPUT = 10_000    # chars


@tool
async def python_repl_tool(code: str) -> str:
    """
    Execute Python code and return stdout + stderr output.
    Use for data processing, calculations, and analysis.
    The code runs in an isolated subprocess with a 30-second timeout.

    Args:
        code: Python code to execute.

    Returns:
        Combined stdout and stderr output (max 10,000 chars).
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(code)
        script_path = f.name

    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            script_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=EXEC_TIMEOUT
            )
        except TimeoutError:
            proc.kill()
            return f"Execution timed out after {EXEC_TIMEOUT}s"

        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            output += "\n[stderr]\n" + stderr.decode("utf-8", errors="replace")

        output = output.strip()
        if len(output) > MAX_OUTPUT:
            output = output[:MAX_OUTPUT] + f"\n... (truncated at {MAX_OUTPUT} chars)"
        return output or "(no output)"

    except Exception as e:
        return f"Execution error: {e!s}"
    finally:
        Path(script_path).unlink(missing_ok=True)


@tool
async def bash_tool(command: str) -> str:
    """
    Execute a bash shell command and return the output.
    Use for file system operations, running scripts, or system commands.
    Timeout: 30 seconds. Output capped at 10,000 chars.

    Args:
        command: Shell command to run.

    Returns:
        Combined stdout and stderr (max 10,000 chars).
    """
    # Basic safety: block obviously destructive commands
    _BLOCKED = ("rm -rf /", "mkfs", ":(){:|:&};:", "dd if=/dev/zero")
    for blocked in _BLOCKED:
        if blocked in command:
            return f"Blocked: command contains '{blocked}'"

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=EXEC_TIMEOUT
            )
        except TimeoutError:
            proc.kill()
            return f"Command timed out after {EXEC_TIMEOUT}s"

        output = ""
        if stdout:
            output += stdout.decode("utf-8", errors="replace")
        if stderr:
            err = stderr.decode("utf-8", errors="replace")
            if err.strip():
                output += "\n[stderr]\n" + err

        output = output.strip()
        if len(output) > MAX_OUTPUT:
            output = output[:MAX_OUTPUT] + f"\n... (truncated at {MAX_OUTPUT} chars)"

        rc = proc.returncode or 0
        if rc != 0:
            output += f"\n[exit code: {rc}]"

        return output or "(no output)"
    except Exception as e:
        return f"Command failed: {e!s}"
