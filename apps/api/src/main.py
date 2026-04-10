"""
main.py — FastAPI application entry point.

Lifespan:
  startup:  telemetry init, MCP client init, heartbeat scheduler start
  shutdown: telemetry flush, MCP client close, scheduler stop

All routers, middleware, and the AG-UI LangGraph endpoint are mounted here.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from src.config.settings import settings
from src.observability.telemetry import flush_telemetry, init_telemetry

log = structlog.get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown logic for all long-lived resources."""
    log.info("mao_api.startup", version="0.1.0")

    # 1. Telemetry — must be first so all subsequent calls are traced
    init_telemetry()
    log.info("telemetry.ready")

    # 2. MCP client — loads tool servers defined in settings
    from src.tools.mcp_tools import init_mcp_client
    await init_mcp_client()
    log.info("mcp_client.ready")

    # 3. Knowledge graph — initialise Kuzu DB connection
    if settings.memory_graph_enabled:
        from src.persistence.knowledge_graph import knowledge_graph
        await knowledge_graph.init()
        log.info("knowledge_graph.ready", path=settings.kuzu_db_path)

    # 4. Checkpointer async setup (Postgres tables)
    from src.persistence.checkpointer import setup_checkpointer
    await setup_checkpointer()

    # 5. Heartbeat scheduler
    from src.graph.scheduler import heartbeat_scheduler
    scheduler_task = asyncio.create_task(heartbeat_scheduler.run())
    log.info("scheduler.started", interval=settings.heartbeat_interval)

    yield  # ── Application is running ──────────────────────────────────────

    # Shutdown
    log.info("mao_api.shutdown")
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass

    from src.tools.mcp_tools import close_mcp_client
    await close_mcp_client()

    flush_telemetry()
    log.info("mao_api.shutdown_complete")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="MAO Platform API",
        description="Multi-Agent Orchestration with Live Graph Visualization",
        version="0.1.0",
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request logging + error handling middleware ────────────────────────────
    from src.api.middleware import ErrorHandlingMiddleware, RequestLoggingMiddleware
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(ErrorHandlingMiddleware)

    # ── REST routers ──────────────────────────────────────────────────────────
    from src.api.routes import router as api_router
    app.include_router(api_router, prefix="/api")

    # ── WebSocket endpoint ────────────────────────────────────────────────────
    from src.streaming.websocket import router as ws_router
    app.include_router(ws_router)

    # ── AG-UI LangGraph endpoint ──────────────────────────────────────────────
    # Mounts POST /agent and GET /agent/stream/{thread_id}
    try:
        from ag_ui_langgraph import add_langgraph_fastapi_endpoint

        from src.graph.graph import graph
        add_langgraph_fastapi_endpoint(app, graph, "/agent")
        log.info("agui_endpoint.mounted", path="/agent")
    except ImportError:
        log.warning("agui_endpoint.skipped", reason="ag-ui-langgraph not installed")

    # ── A2A endpoints (feature-flagged) ──────────────────────────────────────
    if settings.a2a_enabled:
        from src.a2a.executor import router as a2a_router
        app.include_router(a2a_router, prefix="/a2a")
        log.info("a2a_endpoints.mounted")

    return app


app = create_app()
