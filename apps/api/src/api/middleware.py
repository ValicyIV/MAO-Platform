"""
middleware.py — FastAPI middleware stack.

RequestLoggingMiddleware: structured request/response logging via structlog.
ErrorHandlingMiddleware:  catches unhandled exceptions and returns JSON errors.
"""

from __future__ import annotations

import time
import traceback
import uuid

import structlog
from fastapi import Request, Response
from fastapi.responses import ORJSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

log = structlog.get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        request_id = str(uuid.uuid4())[:8]
        start = time.perf_counter()

        log.info(
            "http.request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 1)

        log.info(
            "http.response",
            request_id=request_id,
            status=response.status_code,
            duration_ms=duration_ms,
        )
        response.headers["X-Request-ID"] = request_id
        return response


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            log.error(
                "http.unhandled_error",
                path=request.url.path,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return ORJSONResponse(
                status_code=500,
                content={"error": "Internal server error", "code": "INTERNAL_ERROR"},
            )


# Required annotation import for type hints in middleware
from typing import Any  # noqa: E402
