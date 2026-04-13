"""
OpenTelemetry configuration.

Sets up a TracerProvider that exports spans to Langfuse's OTEL endpoint,
where they are merged with callback-based LLM traces for a unified view.

Also auto-instruments FastAPI (HTTP spans) and httpx (outbound HTTP spans).
"""

from __future__ import annotations

import base64
import logging

logger = logging.getLogger(__name__)

_initialized = False


def setup_otel() -> None:
    """Initialise OpenTelemetry tracing. Idempotent — safe to call multiple times."""
    global _initialized
    if _initialized:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        from src.config.settings import settings

        resource = Resource.create(
            {
                "service.name": "mao-api",
                "service.version": "0.1.0",
                "deployment.environment": "development",
            }
        )

        provider = TracerProvider(resource=resource)

        if settings.langfuse_enabled:
            # Langfuse OTEL endpoint uses Basic auth with public:secret keys
            auth = base64.b64encode(
                f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
            ).decode()

            exporter = OTLPSpanExporter(
                endpoint=f"{settings.langfuse_host}/api/public/otel/v1/traces",
                headers={"Authorization": f"Basic {auth}"},
            )
            provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info("OTEL → Langfuse exporter configured")

        trace.set_tracer_provider(provider)

        # Auto-instrument FastAPI
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            FastAPIInstrumentor().instrument()
            logger.info("FastAPI auto-instrumentation enabled")
        except ImportError:
            logger.warning("opentelemetry-instrumentation-fastapi not installed")

        # Auto-instrument httpx
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument()
            logger.info("httpx auto-instrumentation enabled")
        except ImportError:
            pass

        _initialized = True
        logger.info("OpenTelemetry tracing initialised")

    except ImportError as exc:
        logger.warning("OpenTelemetry not available: %s — tracing disabled", exc)
    except Exception as exc:
        logger.warning("Failed to initialise OpenTelemetry: %s — tracing disabled", exc)


def get_tracer(name: str) -> object:
    """Return an OpenTelemetry tracer for the given instrumentation scope."""
    try:
        from opentelemetry import trace
        return trace.get_tracer(name)
    except ImportError:
        return _NoOpTracer()


class _NoOpTracer:
    """Fallback tracer that does nothing when OTEL is unavailable."""

    def start_as_current_span(self, *args: object, **kwargs: object) -> object:
        from contextlib import contextmanager

        @contextmanager  # type: ignore[misc]
        def noop() -> object:
            yield _NoOpSpan()

        return noop()


class _NoOpSpan:
    def set_attribute(self, *_: object) -> None:
        pass

    def record_exception(self, *_: object) -> None:
        pass
