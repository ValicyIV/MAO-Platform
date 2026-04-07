"""
a2a/client.py — A2A client for calling external agent services.

Used when the supervisor needs to delegate to an agent running in a
different system (different framework, different host).
"""

from __future__ import annotations

import httpx
import structlog

log = structlog.get_logger(__name__)


class A2AClient:
    """Client for calling external A2A-compliant agents."""

    def __init__(self, base_url: str, timeout: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def discover(self) -> dict:
        """Fetch the remote agent's card."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/.well-known/agent-card.json")
            resp.raise_for_status()
            return resp.json()

    async def send_task(self, agent_path: str, task: str) -> str:
        """
        Send a task to a remote A2A agent and collect the full response.

        Args:
            agent_path: Path on the remote host (e.g. '/a2a/research')
            task:       The task text to send.

        Returns:
            Concatenated text response from the remote agent.
        """
        url = f"{self.base_url}{agent_path}"
        payload = {
            "id": "",
            "message": {"parts": [{"type": "text", "text": task}]},
        }

        output_parts: list[str] = []

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        import json
                        try:
                            data = json.loads(line[5:].strip())
                            if data.get("type") == "text":
                                output_parts.append(data.get("text", ""))
                        except json.JSONDecodeError:
                            pass

        result = "".join(output_parts)
        log.info("a2a.task_complete", url=url, response_len=len(result))
        return result
