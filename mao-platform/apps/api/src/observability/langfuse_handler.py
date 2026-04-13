"""
Langfuse CallbackHandler — observability for all LLM calls via LangChain callbacks.

Usage:
    from src.observability.langfuse_handler import get_handler
    config = {"callbacks": [get_handler()], "run_name": "my_run"}
    await graph.ainvoke(input, config=config)
"""

from __future__ import annotations

import logging
from functools import lru_cache

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_handler() -> object:
    """
    Return a cached Langfuse CallbackHandler singleton.

    Returns a no-op handler if Langfuse is not configured, so agents
    work identically in dev (no keys) and prod (with keys).
    """
    from src.config.settings import settings

    if not settings.langfuse_enabled:
        logger.info("Langfuse not configured — returning no-op callback handler")
        return _NoOpHandler()

    try:
        from langfuse.callback import CallbackHandler  # type: ignore[import]

        handler = CallbackHandler(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
            release="0.1.0",
            debug=False,
        )
        logger.info("Langfuse CallbackHandler initialised (host=%s)", settings.langfuse_host)
        return handler
    except ImportError:
        logger.warning("langfuse not installed — returning no-op handler")
        return _NoOpHandler()
    except Exception as exc:
        logger.warning("Failed to initialise Langfuse: %s — using no-op handler", exc)
        return _NoOpHandler()


def flush() -> None:
    """Flush any buffered Langfuse events. Call on app shutdown."""
    handler = get_handler()
    if hasattr(handler, "flush"):
        try:
            handler.flush()  # type: ignore[union-attr]
            logger.info("Langfuse handler flushed")
        except Exception as exc:
            logger.warning("Langfuse flush failed: %s", exc)


class _NoOpHandler:
    """Stub that satisfies LangChain's callback interface without doing anything."""

    def __getattr__(self, _: str) -> object:
        return lambda *args, **kwargs: None
