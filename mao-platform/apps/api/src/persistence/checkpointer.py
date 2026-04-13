"""
LangGraph checkpointer factory.

Dev:  InMemorySaver  — no external deps, state lost on restart
Prod: AsyncPostgresSaver — durable, enables time-travel debugging

The checkpointer is created once at startup and shared across all graph
invocations via the compiled graph object.
"""

from __future__ import annotations

import contextlib
import logging

logger = logging.getLogger(__name__)


def get_checkpointer() -> object:
    """
    Return the appropriate checkpointer based on configuration.

    Synchronous — safe to call at module load time (graph.py).
    Returns MemorySaver for dev/test. For Postgres, returns an
    AsyncPostgresSaver (call ``await setup_checkpointer()`` once
    during the async lifespan to create the checkpoint tables).
    """
    from src.config.settings import settings

    # Always use in-memory if explicitly running tests
    use_memory = "localhost" not in settings.database_url and "asyncpg" not in settings.database_url

    if use_memory:
        from langgraph.checkpoint.memory import MemorySaver
        logger.info("Checkpointer: InMemorySaver (dev/test mode)")
        return MemorySaver()

    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        # Convert asyncpg URL to psycopg format for checkpointer
        pg_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")

        checkpointer = AsyncPostgresSaver.from_conn_string(pg_url)
        # Some versions of LangGraph return an async context manager here.
        # LangGraph's graph compiler expects a BaseCheckpointSaver instance.
        if isinstance(checkpointer, contextlib.AbstractAsyncContextManager) or hasattr(checkpointer, "__aenter__"):
            raise TypeError("AsyncPostgresSaver.from_conn_string returned a context manager")
        # NOTE: .setup() is async — must be called in lifespan, not here.
        logger.info("Checkpointer: AsyncPostgresSaver (Postgres) — call setup_checkpointer() in lifespan")
        return checkpointer

    except Exception as exc:
        logger.warning(
            "Failed to initialise Postgres checkpointer: %s — falling back to InMemorySaver",
            exc,
        )
        from langgraph.checkpoint.memory import MemorySaver
        return MemorySaver()


async def setup_checkpointer() -> None:
    """Call once during async lifespan to create checkpoint tables if using Postgres."""
    from src.graph.graph import graph
    cp = graph.checkpointer
    if hasattr(cp, "setup"):
        try:
            await cp.setup()
            logger.info("Checkpointer: Postgres tables ready")
        except Exception as exc:
            logger.warning("Checkpointer setup failed: %s", exc)
