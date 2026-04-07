"""
LangGraph checkpointer factory.

Dev:  InMemorySaver  — no external deps, state lost on restart
Prod: AsyncPostgresSaver — durable, enables time-travel debugging

The checkpointer is created once at startup and shared across all graph
invocations via the compiled graph object.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def get_checkpointer() -> object:
    """
    Return the appropriate checkpointer based on configuration.

    Returns an AsyncPostgresSaver if DATABASE_URL is set to a real
    Postgres instance, otherwise falls back to InMemorySaver.
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
        await checkpointer.setup()  # creates checkpoint tables if needed
        logger.info("Checkpointer: AsyncPostgresSaver (Postgres)")
        return checkpointer

    except Exception as exc:
        logger.warning(
            "Failed to initialise Postgres checkpointer: %s — falling back to InMemorySaver",
            exc,
        )
        from langgraph.checkpoint.memory import MemorySaver
        return MemorySaver()
