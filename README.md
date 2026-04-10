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
  ├── LangGraph         — Multi-agent orchestration (supervisor + 4 specialists)
  ├── Anthropic Claude  — Extended thinking + streaming
  ├── Memory stack      — Hot cache + episode logs + Kuzu knowledge graph (custom KG pipeline)
  └── Langfuse + OTEL   — Full observability
```

## Quick start

### Prerequisites

- Python 3.12+
- Node 20+
- pnpm 9+
- Docker + Docker Compose
- [uv](https://github.com/astral-sh/uv) (Python package manager)

### 1. Clone and configure

```bash
git clone <repo>
cd mao-platform
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY
```

### 2. Start everything

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

This starts:
| Service   | URL                           |
|-----------|-------------------------------|
| Frontend  | http://localhost:5173         |
| API       | http://localhost:8000         |
| API docs  | http://localhost:8000/api/docs|
| Langfuse  | http://localhost:3001         |

### Docker (full stack)

From the repo root, with `.env` filled in (at minimum an LLM key):

```bash
docker compose up -d --build
```

Open **http://localhost:5173** for the UI. Nginx in the `web` container proxies **`/api`** and **`/ws`** to the `api` service, so the browser uses a single origin. API docs directly: **http://localhost:8000/api/docs**.

### 3. Run a workflow

Open http://localhost:5173, type a task in the toolbar, and click **Run**.

Watch agents spawn as nodes, expand them to see execution steps, and drill into Level 4 to watch live chain-of-thought reasoning stream in real time.

Switch to **Memory** view to see the Obsidian-style knowledge graph populated as agents work.

---

## Project structure

```
mao-platform/
├── apps/
│   ├── api/          # Python FastAPI + LangGraph backend
│   └── web/          # React + React Flow frontend
├── packages/
│   └── shared-types/ # TypeScript types shared across frontend + API client
└── scripts/          # dev.sh, generate-types.sh
```

## Key files

| File | Role |
|------|------|
| `apps/api/src/main.py` | FastAPI entry point + lifespan |
| `apps/api/src/graph/graph.py` | LangGraph StateGraph compilation |
| `apps/api/src/streaming/event_mapper.py` | LangGraph → AG-UI bridge |
| `apps/api/src/streaming/websocket.py` | WebSocket server + ConnectionManager |
| `apps/api/src/persistence/knowledge_graph.py` | Obsidian-style Kuzu KG |
| `apps/web/src/services/AGUIEventRouter.ts` | Event → store dispatcher (RAF buffered) |
| `apps/web/src/services/PretextService.ts` | DOM-free text measurement |
| `apps/web/src/flow/nodes/ThinkingStreamNode.tsx` | Live CoT streaming node |
| `apps/web/src/stores/streamingStore.ts` | Isolated streaming state |

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

## Development phases

- **Phase 0** ✓ Foundation (monorepo, types, Docker, settings)
- **Phase 1** ✓ Agent core (LangGraph graph, registry, prompts)
- **Phase 2** ✓ Streaming pipeline (event_mapper, WebSocket, stores)
- **Phase 3** ✓ Graph UI (FlowCanvas, nodes L1-L2, ELK layout)
- **Phase 4** ✓ Streaming nodes (ThinkingStreamNode, Pretext, L3-L4)
- **Phase 5** — Patterns + memory (knowledge graph depth, consolidation polish, MCP coverage)
- **Phase 6** — Production hardening (PostgreSQL checkpointer, Redis-backed sessions)
- **Phase 7** ✓ Memory Graph UI (EntityNode, RelationshipEdge, live deltas via WebSocket)
