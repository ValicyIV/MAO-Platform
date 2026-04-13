# MAO Platform — Recursion Fix & Hierarchical Conversation View

## Overview

This document describes three interconnected fixes applied to the MAO Platform:

1. **Recursion limit prevention** — stops the infinite supervisor↔specialist loop
2. **Hierarchical conversation panel** — Agent → Topic → Messages → Tools/Thinking
3. **Memory pipeline completion** — ensures episodes are logged for knowledge graph consolidation

---

## 1. Recursion Limit Fix

### Root Cause

The LangGraph workflow had an **unbounded supervisor ↔ specialist loop**:

```
supervisor → specialist → should_verify → supervisor → specialist → ...
```

The only exit was the supervisor LLM calling `complete_workflow`, which it often
didn't do because it kept finding more work. The `verifier → supervisor` edge was
unconditional, and the existing `should_continue()` function (which checks
`is_complete` and `error`) was defined but **never wired into the graph**.

### Fix (3 layers of defense)

#### Layer 1: Iteration counter in supervisor (`supervisor.py`)

A new `iteration_count` field on `OrchestratorState` is incremented every time
the supervisor node executes. After `MAX_SUPERVISOR_ITERATIONS` (12) cycles, the
workflow is **forcibly completed** with partial results.

```python
# supervisor.py
MAX_SUPERVISOR_ITERATIONS = 12

async def supervisor_node(state, writer=None):
    iteration = state.get("iteration_count", 0) + 1
    if iteration > MAX_SUPERVISOR_ITERATIONS:
        return {"next": END, "is_complete": True, "iteration_count": iteration, ...}
    # ... normal LLM routing logic ...
    return {"next": target, "iteration_count": iteration, ...}
```

Every return path (route, complete, no-tool-call) includes `iteration_count`.

#### Layer 2: Conditional verifier→supervisor edge (`graph.py`)

Replaced the unconditional `workflow.add_edge("verifier", "supervisor")` with a
conditional edge that checks `should_continue()` before looping back:

```python
workflow.add_conditional_edges(
    "verifier",
    should_continue,  # checks is_complete / error → END, else → supervisor
    {"supervisor": "supervisor", END: END},
)
```

#### Layer 3: Raised recursion_limit (`websocket.py`)

The LangGraph `recursion_limit` config was bumped from the default 25 to 50,
giving the iteration guard time to trigger cleanly before the hard LangGraph
limit fires.

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/graph/state.py` | Added `iteration_count: int` to `OrchestratorState` |
| `apps/api/src/graph/supervisor.py` | Added `MAX_SUPERVISOR_ITERATIONS` guard, iteration tracking |
| `apps/api/src/graph/graph.py` | Wired `should_continue` into verifier→supervisor edge |
| `apps/api/src/graph/edges.py` | No change (already had `should_continue`, just wasn't used) |
| `apps/api/src/streaming/websocket.py` | Added `recursion_limit: 50` + `iteration_count: 0` to initial state |
| `apps/api/src/tests/conftest.py` | Added `iteration_count` to sample state fixture |

---

## 2. Hierarchical Conversation View

### User Request

> "I want to see the agent names/roles communicating at the top level. Nested
> within that is the topic of conversation, nested in that is the actual
> conversation, nested in that is the tool use and thinking."

### Architecture

```
┌─────────────────────────────────────────────────┐
│ conversationStore.ts (Zustand)                  │
│                                                 │
│  agents: Record<string, AgentEntry>             │
│    └── topics: TopicEntry[]                     │
│          └── messages: MessageEntry[]           │
│                ├── toolCalls: ToolCallEntry[]    │
│                └── thinkingBlocks: ThinkingBlock │
└─────────────────────────────────────────────────┘
        ▲                          │
        │ populate                 │ render
        │                          ▼
┌───────────────┐        ┌─────────────────────────┐
│ AGUIEvent     │        │ ConversationTreePanel    │
│ Router.ts     │        │   └── AgentSection       │
│ (extended)    │        │       └── TopicView      │
│               │        │           └── MessageView│
│               │        │               ├── Tool   │
│               │        │               └── Think  │
└───────────────┘        └─────────────────────────┘
```

### Data Flow

1. **Backend emits events** via WebSocket (unchanged)
2. **AGUIEventRouter** processes events and populates **both** the existing
   `graphStore` (for the React Flow canvas) **and** the new `conversationStore`
   (for the conversation tree)
3. **ConversationTreePanel** renders the hierarchical view from `conversationStore`

### Event Mapping

| Backend Event | conversationStore Action |
|---------------|--------------------------|
| `RUN_STARTED` | `registerAgent()` + `setAgentStatus("running")` |
| `RUN_FINISHED` | `setAgentStatus("complete")` |
| `RUN_ERROR` | `setAgentStatus("error")` |
| `agent_handoff` (custom) | `addTopic()` |
| `TEXT_MESSAGE_START` | `startMessage()` |
| `TEXT_MESSAGE_CONTENT` | `appendMessageText()` (RAF-batched) |
| `TEXT_MESSAGE_END` | `endMessage()` |
| `TOOL_CALL_START` | `startToolCall()` |
| `TOOL_CALL_ARGS` | `updateToolCallArgs()` |
| `TOOL_CALL_END` | `endToolCall()` |
| `thinking_delta` (custom) | `appendThinking()` |
| `status: complete/error` | `setWorkflowStatus()` |

### Token Batching

Conversation store text updates use the same RAF (requestAnimationFrame)
batching pattern as the existing streaming store — tokens are buffered and
flushed at most 60 times per second, not per-token.

### UI Integration

A new **"Conversation"** button is added to the toolbar between "Workflow" and
"Memory". When active, it replaces the React Flow canvas with the
`ConversationTreePanel`. The React Flow graph view remains available via the
"Workflow" button.

### Files Created

| File | Purpose |
|------|---------|
| `apps/web/src/stores/conversationStore.ts` | Hierarchical conversation state |
| `apps/web/src/components/panels/ConversationTreePanel.tsx` | Collapsible tree UI |
| `apps/web/src/__tests__/conversationStore.test.ts` | 25+ unit tests |
| `apps/web/vitest.config.ts` | Vitest configuration |

### Files Modified

| File | Change |
|------|--------|
| `apps/web/src/services/AGUIEventRouter.ts` | Added conversation store wiring, convo token buffer |
| `apps/web/src/App.tsx` | Added "conversation" view mode, ConversationTreePanel rendering |
| `apps/web/src/components/panels/Toolbar.tsx` | Added "Conversation" button, reset wiring |
| `apps/web/package.json` | Added vitest, jsdom, test scripts |

---

## 3. Memory Pipeline Completion

### Root Cause

The knowledge graph appeared empty because:

1. **Workflows crashed at the recursion limit** before agents completed, so
   `append_episode()` in `nodes.py` never fired → no episodes → nothing to
   consolidate → empty KG.

2. **Tool calls weren't logged as episodes.** The `MemoryConsolidator` Stage 3
   (procedural memory) looks for `entry_type == "tool_call"` entries, but
   `agent_node` only logged `llm_call` entries.

### Fix

1. **Recursion fix** (above) ensures agents complete and log episodes.

2. **Tool call logging** added to `agent_node` in `nodes.py`:

```python
# After agent completes, extract tool calls from messages
for msg in result.get("messages", []):
    if hasattr(msg, "tool_calls"):
        for tc in msg.tool_calls:
            await append_episode(agent_id, "tool_call", ..., toolName=tc["name"])
```

This feeds the consolidator's `_update_procedural()` method, which detects
tools used ≥3 times and stores them as Procedure entities in Kuzu.

### Files Changed

| File | Change |
|------|--------|
| `apps/api/src/graph/nodes.py` | Added tool_call episode logging after agent invocation |

---

## Testing

### Backend Tests

```bash
cd apps/api
pytest src/tests/test_recursion_guard.py -v
```

Tests cover:
- `should_continue` edge function (END on complete/error, supervisor otherwise)
- `route_to_agent` validation (valid agents, END for invalid)
- `should_verify` routing (verifier when edits exceed threshold)
- Supervisor iteration guard (force-complete at MAX_ITERATIONS)
- Iteration counter increment on route/complete/first-call
- Graph compilation with new conditional edges
- Tool call episode logging (llm_call + tool_call entries)

### Frontend Tests

```bash
cd apps/web
pnpm install  # installs vitest + jsdom
pnpm test
```

Tests cover:
- Agent registration and metadata updates
- Agent status lifecycle
- Topic creation (single and multiple)
- Message streaming (start, append, end)
- Token counting
- Tool call lifecycle (start, args, end with result/status)
- Thinking block streaming
- Expand/collapse state management
- Full reset
- End-to-end multi-agent workflow simulation

---

## Configuration

| Setting | Default | Location | Purpose |
|---------|---------|----------|---------|
| `MAX_SUPERVISOR_ITERATIONS` | 12 | `supervisor.py` | Hard stop for supervisor cycles |
| `recursion_limit` | 50 | `websocket.py` | LangGraph safety net (should never fire) |
| `verification_threshold` | (from settings) | `settings.py` | Edit count to trigger verifier |
| `memory_graph_enabled` | (from settings) | `settings.py` | Enables Kuzu KG + consolidation |
