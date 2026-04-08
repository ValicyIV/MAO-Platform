# MAO Platform

**Multi-Agent Orchestration with Live Graph Visualization**

A production-grade platform where a central orchestrator delegates to specialist AI agents. Every step — including live chain-of-thought reasoning — is visible in real time as an interactive, expandable graph. An Obsidian-style knowledge graph captures everything agents learn across sessions.

---

## Architecture at a glance

```
Browser (React Flow)
  ├── Workflow Graph    — 4-level expandable: Orchestrator → Specialist → Step → Thinking
  └── Memory Graph      — Shared knowledge graph (entities, relationships, conflicts)
          ↕ WebSocket (AG-UI events)
FastAPI backend
  ├── LangGraph         — Multi-agent orchestration (supervisor + 5 specialists)
  ├── Model router      — Anthropic Claude, OpenRouter (200+ models), Ollama (local)
  ├── Memory stack      — Hot cache + episode logs + Kuzu knowledge graph
  ├── Langfuse + OTEL   — Full observability
  └── MCP               — Tool servers (GitHub, Postgres, custom)
```

## Quick start

### Prerequisites

- **Docker + Docker Compose** (required)
- At least one LLM provider:
  - [Anthropic API key](https://console.anthropic.com/) — required for `claude-*` models and extended thinking
  - [OpenRouter API key](https://openrouter.ai/keys) — pay-per-token access to 200+ models
  - [Ollama](https://ollama.ai) — free local inference (llama3, mistral, phi-3, etc.)

### 1. Clone and configure

```bash
git clone <repo>
cd mao-platform
cp .env.example .env
```

Edit `.env` and set at least one LLM provider key:

```bash
# Option A: Anthropic (required for claude-* models + extended thinking)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Option B: OpenRouter (200+ models, pay-per-token)
OPENROUTER_API_KEY=sk-or-v1-...

# Option C: Ollama (free, local — install from https://ollama.ai)
OLLAMA_BASE_URL=http://localhost:11434
```

All three providers can coexist. The model ID convention determines routing:
- `claude-*` → Anthropic
- `ollama/<name>` → Ollama (e.g. `ollama/llama3.2`)
- `<org>/<model>` → OpenRouter (e.g. `openai/gpt-4o`)

### 2. Start everything (Docker)

**Development** (hot reload for API + frontend):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**Production** (built images, nginx):

```bash
docker compose up
```

**Alternative — native dev** (no Docker for API/frontend, only infra):

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

### Services

| Service   | URL                            | Notes                          |
|-----------|--------------------------------|--------------------------------|
| Frontend  | http://localhost:5173          | React + React Flow             |
| API       | http://localhost:8000          | FastAPI + LangGraph            |
| API docs  | http://localhost:8000/api/docs | Swagger UI                     |
| Langfuse  | http://localhost:3001          | Observability dashboard        |
| Postgres  | `localhost:5432`               | LangGraph checkpointer         |
| Redis     | `localhost:6379`               | WebSocket session state        |

### 3. Run a workflow

Open http://localhost:5173, type a task in the toolbar, and click **Run**.

Watch agents spawn as nodes, expand them to see execution steps, and drill into Level 4 to watch live chain-of-thought reasoning stream in real time.

Switch to **Memory** view to see the Obsidian-style knowledge graph populated as agents work.

---

## Docker Compose files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production stack — all services with built images |
| `docker-compose.dev.yml` | Dev overrides — hot reload via volume mounts (API: uvicorn `--reload`, Web: Vite HMR) |

**Useful commands:**

```bash
# Start dev mode (foreground with logs)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Start in background
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View API logs
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs api -f

# Rebuild API after dependency changes
docker compose -f docker-compose.yml -f docker-compose.dev.yml build api --no-cache

# Tear down everything (including volumes)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --volumes --remove-orphans
```

---

## Project structure

```
mao-platform/
├── apps/
│   ├── api/                # Python FastAPI + LangGraph backend
│   │   ├── src/
│   │   │   ├── agents/     # Agent registry, base factory
│   │   │   ├── api/        # REST routes, middleware, schemas
│   │   │   ├── config/     # Settings, prompts
│   │   │   ├── graph/      # LangGraph state machine, nodes, edges, scheduler
│   │   │   ├── persistence/# Memory store, knowledge graph, consolidator
│   │   │   ├── streaming/  # WebSocket, SSE, AG-UI event mapper
│   │   │   └── tools/      # Agent tools (search, code, documents, MCP)
│   │   ├── Dockerfile
│   │   └── pyproject.toml
│   └── web/                # React + React Flow frontend
│       └── src/
│           ├── services/   # WebSocketService, AGUIEventRouter
│           ├── stores/     # Zustand stores (graph, streaming, agentStatus, memoryGraph)
│           └── flow/       # React Flow nodes and canvas components
├── packages/
│   └── shared-types/       # TypeScript types shared across frontend + API client
├── scripts/                # dev.sh
├── data/                   # Persistent data (gitignored except .gitkeep)
│   ├── agent-memory/       # Hot cache + episode logs
│   └── kuzu/               # Kuzu knowledge graph DB
├── docker-compose.yml      # Production stack
├── docker-compose.dev.yml  # Dev overrides (hot reload)
└── .env.example            # Environment variable template
```

## Key files

| File | Role |
|------|------|
| `apps/api/src/main.py` | FastAPI entry point + lifespan |
| `apps/api/src/config/settings.py` | Pydantic settings (env vars, validation) |
| `apps/api/src/config/prompts.py` | All agent system prompts (cache boundary pattern) |
| `apps/api/src/graph/graph.py` | LangGraph StateGraph compilation |
| `apps/api/src/graph/state.py` | `OrchestratorState` TypedDict with reducers |
| `apps/api/src/graph/supervisor.py` | Orchestrator node (routes tasks to specialists) |
| `apps/api/src/graph/nodes.py` | Specialist agent node wrapper |
| `apps/api/src/graph/edges.py` | Conditional routing + verification trigger |
| `apps/api/src/graph/scheduler.py` | Heartbeat scheduler (consolidation, pruning) |
| `apps/api/src/agents/registry.py` | Agent configs + build (model routing, tools) |
| `apps/api/src/agents/base.py` | `create_specialist_agent` factory |
| `apps/api/src/streaming/event_mapper.py` | LangGraph → AG-UI event bridge |
| `apps/api/src/streaming/websocket.py` | WebSocket server + ConnectionManager |
| `apps/api/src/streaming/sse.py` | SSE fallback transport |
| `apps/api/src/persistence/knowledge_graph.py` | Kuzu knowledge graph (entities, relations) |
| `apps/api/src/persistence/memory_store.py` | Hot cache (Tier 1) + episode logs (Tier 2) |
| `apps/api/src/persistence/memory_retriever.py` | Context injection from all memory tiers |
| `apps/api/src/persistence/memory_consolidator.py` | Background consolidation (facts, KG, procedures) |
| `apps/web/src/services/WebSocketService.ts` | WS connection lifecycle + reconnect backoff |
| `apps/web/src/services/AGUIEventRouter.ts` | Event → store dispatcher (RAF buffered) |
| `apps/web/src/stores/graphStore.ts` | Topology state (nodes, edges, expand/collapse) |
| `apps/web/src/stores/streamingStore.ts` | Isolated streaming text state (60fps cap) |
| `apps/web/src/stores/agentStatusStore.ts` | Agent lifecycle state |
| `apps/web/src/stores/memoryGraphStore.ts` | Memory graph entities + relationships |

## Architectural patterns

| # | Pattern | File(s) |
|---|---------|---------|
| 1 | Fork-with-cache-inheritance | `graph/nodes.py` |
| 2 | Stable/dynamic prompt cache boundary | `config/prompts.py`, `agents/base.py` |
| 3 | Explicit model routing | `agents/registry.py` |
| 4 | Verification agent | `graph/graph.py`, `graph/edges.py` |
| 5 | OpenClaw mailbox communication | `graph/state.py` |
| 6 | Heartbeat scheduler | `graph/scheduler.py` |
| 7 | Three-layer memory (upgraded) | `persistence/memory_store.py`, `knowledge_graph.py` |
| 8 | Background memory consolidation | `persistence/memory_consolidator.py` |
| 9 | EdgeClaw privacy routing | `agents/base.py` |
| 10 | Three-store Zustand architecture | `stores/graphStore.ts`, `streamingStore.ts`, `agentStatusStore.ts` |
| 11 | RAF-buffered token batching | `services/AGUIEventRouter.ts` |
| 12 | Pretext height pre-computation | `services/PretextService.ts` |
| 13 | AG-UI event routing | `services/AGUIEventRouter.ts` |
| 14 | Cross-agent knowledge graph | `persistence/knowledge_graph.py` |
| 15 | Memory-augmented context injection | `persistence/memory_retriever.py` |
| 16 | Memory Graph UI view | `flow/memory/MemoryGraphCanvas.tsx` |

## Environment variables

See `.env.example` for the full list. Key groups:

| Group | Variables | Required |
|-------|-----------|----------|
| **LLM Providers** | `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL` | At least one |
| **Langfuse** | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | No (observability) |
| **Database** | `DATABASE_URL`, `REDIS_URL` | Auto-configured in Docker |
| **Memory** | `KUZU_DB_PATH`, `MEMORY_*_TOKENS`, `MEMORY_GRAPH_HOPS` | No (has defaults) |
| **Agent** | `DEFAULT_MODEL`, `HEARTBEAT_INTERVAL`, `VERIFICATION_THRESHOLD` | No (has defaults) |
| **Features** | `EXTENDED_THINKING_ENABLED`, `A2A_ENABLED`, `KAIROS_DAEMON_ENABLED` | No (has defaults) |

## Development phases

- **Phase 0** ✓ Foundation (monorepo, types, Docker, settings)
- **Phase 1** ✓ Agent core (LangGraph graph, registry, prompts)
- **Phase 2** ✓ Streaming pipeline (event_mapper, WebSocket, stores)
- **Phase 3** — Graph UI (FlowCanvas, nodes L1-L2, ELK layout)
- **Phase 4** — Streaming nodes (ThinkingStreamNode, Pretext, L3-L4)
- **Phase 5** — Patterns + memory (knowledge graph, consolidation, MCP)
- **Phase 6** — Production hardening (PostgreSQL checkpointer, Redis WS)
- **Phase 7** — Memory Graph UI (EntityNode, RelationshipEdge, live deltas)
