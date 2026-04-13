// conversationStore.ts — Hierarchical conversation state (Pattern 10)
//
// Groups all workflow events into the structure Garry requested:
//   Level 1: Agent (name, role, status)
//   Level 2: Topic (task delegated via handoff)
//   Level 3: Messages (streamed text content)
//   Level 4: Tool calls + thinking blocks
//
// Update frequency: ~1-60/sec (token streams). Uses plain object spread
// like streamingStore — no immer overhead for high-frequency text concat.

import { create } from "zustand";

// ── Data shapes ──────────────────────────────────────────────────────────────

export interface ToolCallEntry {
  id: string;
  toolName: string;
  args: string;
  result: string | null;
  status: "pending" | "running" | "success" | "error";
  startedAt: number;
  durationMs: number | null;
}

export interface ThinkingBlock {
  id: string;
  text: string;
  isStreaming: boolean;
}

export interface MessageEntry {
  id: string;
  agentId: string;
  text: string;
  isStreaming: boolean;
  isThinking: boolean;
  startedAt: number;
  endedAt: number | null;
  toolCalls: ToolCallEntry[];
  thinkingBlocks: ThinkingBlock[];
}

export interface TopicEntry {
  id: string;
  task: string;
  reason: string;
  fromAgentId: string;
  startedAt: number;
  messages: MessageEntry[];
}

export interface AgentEntry {
  agentId: string;
  agentName: string;
  role: string;
  model: string;
  tools: string[];
  status: "idle" | "running" | "complete" | "error";
  topics: TopicEntry[];
  tokenCount: number;
  startedAt: number | null;
}

// ── Store interface ──────────────────────────────────────────────────────────

interface ConversationStore {
  agents: Record<string, AgentEntry>;
  agentOrder: string[];
  workflowStatus: "idle" | "running" | "complete" | "error";
  expandedAgents: Set<string>;
  expandedTopics: Set<string>;
  expandedMessages: Set<string>;

  // Agent lifecycle
  registerAgent: (agentId: string, meta: { agentName?: string; role?: string; model?: string; tools?: string[] }) => void;
  setAgentStatus: (agentId: string, status: AgentEntry["status"]) => void;

  // Topic (from agent_handoff events)
  addTopic: (agentId: string, topic: Omit<TopicEntry, "messages">) => void;

  // Message streaming
  startMessage: (agentId: string, messageId: string, isThinking: boolean) => void;
  appendMessageText: (agentId: string, messageId: string, delta: string) => void;
  endMessage: (agentId: string, messageId: string) => void;

  // Tool calls (nested under current message)
  startToolCall: (agentId: string, toolCallId: string, toolName: string) => void;
  updateToolCallArgs: (toolCallId: string, argsDelta: string) => void;
  endToolCall: (toolCallId: string, result: string, status: ToolCallEntry["status"], durationMs: number) => void;

  // Thinking (nested under current message)
  appendThinking: (agentId: string, messageId: string, delta: string) => void;

  // Expand/collapse
  toggleAgent: (agentId: string) => void;
  toggleTopic: (topicId: string) => void;
  toggleMessage: (messageId: string) => void;

  // Workflow lifecycle
  setWorkflowStatus: (status: ConversationStore["workflowStatus"]) => void;
  reset: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureAgent(agents: Record<string, AgentEntry>, agentOrder: string[], agentId: string): { agents: Record<string, AgentEntry>; agentOrder: string[] } {
  if (agents[agentId]) return { agents, agentOrder };
  const newAgent: AgentEntry = {
    agentId,
    agentName: agentId,
    role: agentId,
    model: "",
    tools: [],
    status: "idle",
    topics: [],
    tokenCount: 0,
    startedAt: null,
  };
  return {
    agents: { ...agents, [agentId]: newAgent },
    agentOrder: [...agentOrder, agentId],
  };
}

function getCurrentTopic(agent: AgentEntry): TopicEntry | undefined {
  return agent.topics[agent.topics.length - 1];
}

function getCurrentMessage(agent: AgentEntry): MessageEntry | undefined {
  const topic = getCurrentTopic(agent);
  if (!topic) return undefined;
  return topic.messages[topic.messages.length - 1];
}

/** Deep-clone an agent to avoid stale references with spread */
function cloneAgent(a: AgentEntry): AgentEntry {
  return {
    ...a,
    tools: [...a.tools],
    topics: a.topics.map((t) => ({
      ...t,
      messages: t.messages.map((m) => ({
        ...m,
        toolCalls: m.toolCalls.map((tc) => ({ ...tc })),
        thinkingBlocks: m.thinkingBlocks.map((tb) => ({ ...tb })),
      })),
    })),
  };
}

// Map from toolCallId → agentId for routing endToolCall without agentId
const _toolCallAgentMap = new Map<string, string>();

// ── Store implementation ─────────────────────────────────────────────────────

export const useConversationStore = create<ConversationStore>()((set) => ({
  agents: {},
  agentOrder: [],
  workflowStatus: "idle",
  expandedAgents: new Set<string>(),
  expandedTopics: new Set<string>(),
  expandedMessages: new Set<string>(),

  registerAgent: (agentId, meta) =>
    set((s) => {
      const { agents, agentOrder } = ensureAgent(s.agents, s.agentOrder, agentId);
      const agent = cloneAgent(agents[agentId]!);
      if (meta.agentName) agent.agentName = meta.agentName;
      if (meta.role) agent.role = meta.role;
      if (meta.model) agent.model = meta.model;
      if (meta.tools) agent.tools = meta.tools;
      // Auto-expand on first registration
      const expanded = new Set(s.expandedAgents);
      expanded.add(agentId);
      return { agents: { ...agents, [agentId]: agent }, agentOrder, expandedAgents: expanded };
    }),

  setAgentStatus: (agentId, status) =>
    set((s) => {
      const { agents, agentOrder } = ensureAgent(s.agents, s.agentOrder, agentId);
      const agent = cloneAgent(agents[agentId]!);
      agent.status = status;
      if (status === "running" && !agent.startedAt) agent.startedAt = Date.now();
      return { agents: { ...agents, [agentId]: agent }, agentOrder };
    }),

  addTopic: (agentId, topic) =>
    set((s) => {
      const { agents, agentOrder } = ensureAgent(s.agents, s.agentOrder, agentId);
      const agent = cloneAgent(agents[agentId]!);
      agent.topics.push({ ...topic, messages: [] });
      // Auto-expand agent and topic
      const expandedAgents = new Set(s.expandedAgents);
      expandedAgents.add(agentId);
      const expandedTopics = new Set(s.expandedTopics);
      expandedTopics.add(topic.id);
      return { agents: { ...agents, [agentId]: agent }, agentOrder, expandedAgents, expandedTopics };
    }),

  startMessage: (agentId, messageId, isThinking) =>
    set((s) => {
      const { agents, agentOrder } = ensureAgent(s.agents, s.agentOrder, agentId);
      const agent = cloneAgent(agents[agentId]!);
      // Ensure at least one topic exists
      if (agent.topics.length === 0) {
        agent.topics.push({
          id: `topic-${agentId}-${Date.now()}`,
          task: "General",
          reason: "",
          fromAgentId: "supervisor",
          startedAt: Date.now(),
          messages: [],
        });
      }
      const topic = agent.topics[agent.topics.length - 1]!;
      const existing = topic.messages.find((m) => m.id === messageId);
      if (existing) {
        existing.isStreaming = true;
        existing.endedAt = null;
        if (!isThinking) {
          existing.isThinking = false;
        }
      } else {
        topic.messages.push({
          id: messageId,
          agentId,
          text: "",
          isStreaming: true,
          isThinking,
          startedAt: Date.now(),
          endedAt: null,
          toolCalls: [],
          thinkingBlocks: [],
        });
      }
      return { agents: { ...agents, [agentId]: agent }, agentOrder };
    }),

  appendMessageText: (agentId, messageId, delta) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      const agent = cloneAgent(existing);
      for (const topic of agent.topics) {
        const msg = topic.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.text += delta;
          agent.tokenCount += delta.length;
          return { agents: { ...s.agents, [agentId]: agent } };
        }
      }
      return s;
    }),

  endMessage: (agentId, messageId) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      const agent = cloneAgent(existing);
      for (const topic of agent.topics) {
        const msg = topic.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.isStreaming = false;
          msg.endedAt = Date.now();
          return { agents: { ...s.agents, [agentId]: agent } };
        }
      }
      return s;
    }),

  startToolCall: (agentId, toolCallId, toolName) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      _toolCallAgentMap.set(toolCallId, agentId);
      const agent = cloneAgent(existing);
      const msg = getCurrentMessage(agent);
      if (msg) {
        msg.toolCalls.push({
          id: toolCallId,
          toolName,
          args: "",
          result: null,
          status: "running",
          startedAt: Date.now(),
          durationMs: null,
        });
      }
      return { agents: { ...s.agents, [agentId]: agent } };
    }),

  updateToolCallArgs: (toolCallId, argsDelta) =>
    set((s) => {
      const agentId = _toolCallAgentMap.get(toolCallId);
      if (!agentId) return s;
      const existing = s.agents[agentId];
      if (!existing) return s;
      const agent = cloneAgent(existing);
      for (const topic of agent.topics) {
        for (const msg of topic.messages) {
          const tc = msg.toolCalls.find((t) => t.id === toolCallId);
          if (tc) {
            tc.args += argsDelta;
            return { agents: { ...s.agents, [agentId]: agent } };
          }
        }
      }
      return s;
    }),

  endToolCall: (toolCallId, result, status, durationMs) =>
    set((s) => {
      const agentId = _toolCallAgentMap.get(toolCallId);
      if (!agentId) return s;
      const existing = s.agents[agentId];
      if (!existing) return s;
      const agent = cloneAgent(existing);
      for (const topic of agent.topics) {
        for (const msg of topic.messages) {
          const tc = msg.toolCalls.find((t) => t.id === toolCallId);
          if (tc) {
            tc.result = result;
            tc.status = status;
            tc.durationMs = durationMs;
            return { agents: { ...s.agents, [agentId]: agent } };
          }
        }
      }
      return s;
    }),

  appendThinking: (agentId, messageId, delta) =>
    set((s) => {
      const existing = s.agents[agentId];
      if (!existing) return s;
      const agent = cloneAgent(existing);
      for (const topic of agent.topics) {
        const msg = topic.messages.find((m) => m.id === messageId);
        if (msg) {
          let block = msg.thinkingBlocks[msg.thinkingBlocks.length - 1];
          if (!block || !block.isStreaming) {
            block = { id: `think-${Date.now()}`, text: "", isStreaming: true };
            msg.thinkingBlocks.push(block);
          }
          block.text += delta;
          return { agents: { ...s.agents, [agentId]: agent } };
        }
      }
      return s;
    }),

  toggleAgent: (agentId) =>
    set((s) => {
      const expanded = new Set(s.expandedAgents);
      if (expanded.has(agentId)) expanded.delete(agentId);
      else expanded.add(agentId);
      return { expandedAgents: expanded };
    }),

  toggleTopic: (topicId) =>
    set((s) => {
      const expanded = new Set(s.expandedTopics);
      if (expanded.has(topicId)) expanded.delete(topicId);
      else expanded.add(topicId);
      return { expandedTopics: expanded };
    }),

  toggleMessage: (messageId) =>
    set((s) => {
      const expanded = new Set(s.expandedMessages);
      if (expanded.has(messageId)) expanded.delete(messageId);
      else expanded.add(messageId);
      return { expandedMessages: expanded };
    }),

  setWorkflowStatus: (status) => set({ workflowStatus: status }),

  reset: () => {
    _toolCallAgentMap.clear();
    set({
      agents: {},
      agentOrder: [],
      workflowStatus: "idle",
      expandedAgents: new Set(),
      expandedTopics: new Set(),
      expandedMessages: new Set(),
    });
  },
}));
