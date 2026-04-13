"""
Unified telemetry initialisation and @observe decorator.

Usage:
    from src.observability.telemetry import init_telemetry, flush_telemetry, observe

    # In main.py lifespan:
    init_telemetry()

    # On arbitrary functions:
    @observe("my_operation")
    async def my_func() -> None: ...
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Callable, Coroutine
from typing import Any, TypeVar

from src.observability.langfuse_handler import flush as flush_langfuse
from src.observability.otel_setup import get_tracer, setup_otel

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Coroutine[Any, Any, Any]])


def init_telemetry() -> None:
    """Initialise all telemetry backends. Call once at application startup."""
    setup_otel()
    logger.info("Telemetry initialised")


def flush_telemetry() -> None:
    """Flush all buffered telemetry. Call at application shutdown."""
    flush_langfuse()
    logger.info("Telemetry flushed")


def observe(span_name: str | None = None) -> Callable[[F], F]:
    """
    Decorator that wraps an async function in an OpenTelemetry span.

    Usage:
        @observe("memory.consolidate")
        async def consolidate(agent_id: str) -> None: ...
    """
    def decorator(func: F) -> F:
        name = span_name or f"{func.__module__}.{func.__qualname__}"

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer(func.__module__)
            with tracer.start_as_current_span(name) as span:  # type: ignore[union-attr]
                try:
                    result = await func(*args, **kwargs)
                    return result
                except Exception as exc:
                    span.record_exception(exc)  # type: ignore[union-attr]
                    raise

        return wrapper  # type: ignore[return-value]

    return decorator
