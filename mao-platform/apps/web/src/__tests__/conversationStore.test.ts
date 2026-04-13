/**
 * conversationStore.test.ts — Unit tests for the hierarchical conversation store.
 *
 * Tests the full lifecycle: agent registration → topic creation → message
 * streaming → tool calls → thinking blocks → expand/collapse → reset.
 *
 * Run with: npx vitest run src/__tests__/conversationStore.test.ts
 * (after adding vitest to devDependencies)
 *
 * Can also be run as a plain Node test with the zustand/vanilla export.
 * For now, tests are structured to work with any test runner that supports
 * import() and basic assertions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useConversationStore } from "../stores/conversationStore";

// Reset store before each test
beforeEach(() => {
  useConversationStore.getState().reset();
});

describe("conversationStore", () => {
  // ── Agent registration ──────────────────────────────────────────────────

  describe("registerAgent", () => {
    it("creates a new agent entry with metadata", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", {
        agentName: "Research Agent",
        role: "research",
        model: "claude-sonnet-4-6",
        tools: ["web_search", "read_file"],
      });

      const state = useConversationStore.getState();
      expect(state.agentOrder).toEqual(["research"]);
      expect(state.agents.research).toBeDefined();
      expect(state.agents.research!.agentName).toBe("Research Agent");
      expect(state.agents.research!.role).toBe("research");
      expect(state.agents.research!.model).toBe("claude-sonnet-4-6");
      expect(state.agents.research!.tools).toEqual(["web_search", "read_file"]);
      expect(state.agents.research!.status).toBe("idle");
      // Auto-expanded on registration
      expect(state.expandedAgents.has("research")).toBe(true);
    });

    it("updates existing agent metadata without duplicating", () => {
      const store = useConversationStore.getState();
      store.registerAgent("code", { agentName: "Code Agent", role: "code" });
      store.registerAgent("code", { model: "gpt-4o" });

      const state = useConversationStore.getState();
      expect(state.agentOrder).toEqual(["code"]); // not duplicated
      expect(state.agents.code!.agentName).toBe("Code Agent"); // preserved
      expect(state.agents.code!.model).toBe("gpt-4o"); // updated
    });

    it("preserves agent ordering", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.registerAgent("code", { agentName: "Code" });
      store.registerAgent("writer", { agentName: "Writer" });

      expect(useConversationStore.getState().agentOrder).toEqual([
        "research",
        "code",
        "writer",
      ]);
    });
  });

  // ── Agent status ────────────────────────────────────────────────────────

  describe("setAgentStatus", () => {
    it("updates agent status and sets startedAt on running", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.setAgentStatus("research", "running");

      const agent = useConversationStore.getState().agents.research!;
      expect(agent.status).toBe("running");
      expect(agent.startedAt).toBeGreaterThan(0);
    });

    it("auto-creates agent if not registered", () => {
      const store = useConversationStore.getState();
      store.setAgentStatus("unknown_agent", "running");

      const state = useConversationStore.getState();
      expect(state.agents.unknown_agent).toBeDefined();
      expect(state.agentOrder).toContain("unknown_agent");
    });
  });

  // ── Topics ──────────────────────────────────────────────────────────────

  describe("addTopic", () => {
    it("adds a topic under an agent", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.addTopic("research", {
        id: "topic-1",
        task: "Analyze market trends",
        reason: "User requested market analysis",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });

      const agent = useConversationStore.getState().agents.research!;
      expect(agent.topics).toHaveLength(1);
      expect(agent.topics[0]!.task).toBe("Analyze market trends");
      expect(agent.topics[0]!.messages).toEqual([]);
      // Auto-expanded
      expect(useConversationStore.getState().expandedTopics.has("topic-1")).toBe(true);
    });

    it("supports multiple topics per agent", () => {
      const store = useConversationStore.getState();
      store.registerAgent("code", { agentName: "Code" });
      store.addTopic("code", {
        id: "t1",
        task: "Write the API",
        reason: "backend needed",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });
      store.addTopic("code", {
        id: "t2",
        task: "Fix the bug",
        reason: "error reported",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });

      const agent = useConversationStore.getState().agents.code!;
      expect(agent.topics).toHaveLength(2);
      expect(agent.topics[0]!.task).toBe("Write the API");
      expect(agent.topics[1]!.task).toBe("Fix the bug");
    });
  });

  // ── Message streaming ──────────────────────────────────────────────────

  describe("message lifecycle", () => {
    it("starts a message under the current topic", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.addTopic("research", {
        id: "t1",
        task: "Search",
        reason: "",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });
      store.startMessage("research", "msg-1", false);

      const topic = useConversationStore.getState().agents.research!.topics[0]!;
      expect(topic.messages).toHaveLength(1);
      expect(topic.messages[0]!.id).toBe("msg-1");
      expect(topic.messages[0]!.isStreaming).toBe(true);
      expect(topic.messages[0]!.text).toBe("");
    });

    it("creates a default topic if none exist", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      // No addTopic — should auto-create
      store.startMessage("research", "msg-1", false);

      const agent = useConversationStore.getState().agents.research!;
      expect(agent.topics).toHaveLength(1);
      expect(agent.topics[0]!.task).toBe("General");
      expect(agent.topics[0]!.messages).toHaveLength(1);
    });

    it("appends text to a message", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.startMessage("research", "msg-1", false);
      store.appendMessageText("research", "msg-1", "Hello ");
      store.appendMessageText("research", "msg-1", "world!");

      const msg = useConversationStore.getState().agents.research!.topics[0]!.messages[0]!;
      expect(msg.text).toBe("Hello world!");
    });

    it("increments tokenCount on append", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.startMessage("research", "msg-1", false);
      store.appendMessageText("research", "msg-1", "12345");
      store.appendMessageText("research", "msg-1", "67890");

      const agent = useConversationStore.getState().agents.research!;
      expect(agent.tokenCount).toBe(10);
    });

    it("ends a message", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.startMessage("research", "msg-1", false);
      store.appendMessageText("research", "msg-1", "Done");
      store.endMessage("research", "msg-1");

      const msg = useConversationStore.getState().agents.research!.topics[0]!.messages[0]!;
      expect(msg.isStreaming).toBe(false);
      expect(msg.endedAt).toBeGreaterThan(0);
    });
  });

  // ── Tool calls ──────────────────────────────────────────────────────────

  describe("tool calls", () => {
    it("adds a tool call under the current message", () => {
      const store = useConversationStore.getState();
      store.registerAgent("code", { agentName: "Code" });
      store.startMessage("code", "msg-1", false);
      store.startToolCall("code", "tc-1", "write_file");

      const msg = useConversationStore.getState().agents.code!.topics[0]!.messages[0]!;
      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls[0]!.toolName).toBe("write_file");
      expect(msg.toolCalls[0]!.status).toBe("running");
    });

    it("updates tool call args", () => {
      const store = useConversationStore.getState();
      store.registerAgent("code", { agentName: "Code" });
      store.startMessage("code", "msg-1", false);
      store.startToolCall("code", "tc-1", "write_file");
      store.updateToolCallArgs("tc-1", '{"path":');
      store.updateToolCallArgs("tc-1", '"/test.py"}');

      const tc = useConversationStore.getState().agents.code!.topics[0]!.messages[0]!.toolCalls[0]!;
      expect(tc.args).toBe('{"path":"/test.py"}');
    });

    it("ends a tool call with result and status", () => {
      const store = useConversationStore.getState();
      store.registerAgent("code", { agentName: "Code" });
      store.startMessage("code", "msg-1", false);
      store.startToolCall("code", "tc-1", "write_file");
      store.endToolCall("tc-1", "File written successfully", "success", 150);

      const tc = useConversationStore.getState().agents.code!.topics[0]!.messages[0]!.toolCalls[0]!;
      expect(tc.result).toBe("File written successfully");
      expect(tc.status).toBe("success");
      expect(tc.durationMs).toBe(150);
    });
  });

  // ── Thinking blocks ─────────────────────────────────────────────────────

  describe("thinking blocks", () => {
    it("appends thinking text to a message", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.startMessage("research", "msg-1", true);
      store.appendThinking("research", "msg-1", "Let me think...");
      store.appendThinking("research", "msg-1", " I should search first.");

      const msg = useConversationStore.getState().agents.research!.topics[0]!.messages[0]!;
      expect(msg.thinkingBlocks).toHaveLength(1);
      expect(msg.thinkingBlocks[0]!.text).toBe("Let me think... I should search first.");
      expect(msg.thinkingBlocks[0]!.isStreaming).toBe(true);
    });
  });

  // ── Expand/collapse ─────────────────────────────────────────────────────

  describe("expand/collapse", () => {
    it("toggles agent expansion", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      expect(useConversationStore.getState().expandedAgents.has("research")).toBe(true);

      store.toggleAgent("research");
      expect(useConversationStore.getState().expandedAgents.has("research")).toBe(false);

      store.toggleAgent("research");
      expect(useConversationStore.getState().expandedAgents.has("research")).toBe(true);
    });

    it("toggles topic expansion", () => {
      const store = useConversationStore.getState();
      store.toggleTopic("topic-1");
      expect(useConversationStore.getState().expandedTopics.has("topic-1")).toBe(true);

      store.toggleTopic("topic-1");
      expect(useConversationStore.getState().expandedTopics.has("topic-1")).toBe(false);
    });

    it("toggles message expansion", () => {
      const store = useConversationStore.getState();
      store.toggleMessage("msg-1");
      expect(useConversationStore.getState().expandedMessages.has("msg-1")).toBe(true);

      store.toggleMessage("msg-1");
      expect(useConversationStore.getState().expandedMessages.has("msg-1")).toBe(false);
    });
  });

  // ── Reset ───────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("clears all state", () => {
      const store = useConversationStore.getState();
      store.registerAgent("research", { agentName: "Research" });
      store.addTopic("research", {
        id: "t1",
        task: "Search",
        reason: "",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });
      store.startMessage("research", "msg-1", false);
      store.appendMessageText("research", "msg-1", "text");
      store.setWorkflowStatus("running");

      store.reset();

      const state = useConversationStore.getState();
      expect(Object.keys(state.agents)).toHaveLength(0);
      expect(state.agentOrder).toHaveLength(0);
      expect(state.workflowStatus).toBe("idle");
      expect(state.expandedAgents.size).toBe(0);
    });
  });

  // ── Full workflow simulation ────────────────────────────────────────────

  describe("full workflow simulation", () => {
    it("simulates a complete multi-agent workflow", () => {
      const store = useConversationStore.getState();

      // Workflow starts
      store.setWorkflowStatus("running");

      // Supervisor registers
      store.registerAgent("supervisor", {
        agentName: "Supervisor",
        role: "orchestrator",
        model: "claude-opus-4-6",
      });
      store.setAgentStatus("supervisor", "running");

      // Supervisor hands off to research
      store.registerAgent("research", {
        agentName: "Research Agent",
        role: "research",
        model: "claude-sonnet-4-6",
        tools: ["web_search"],
      });
      store.setAgentStatus("research", "running");
      store.addTopic("research", {
        id: "topic-research-1",
        task: "Find AI market data for 2025",
        reason: "Need market size figures",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });

      // Research agent streams a message
      store.startMessage("research", "msg-r1", false);
      store.appendMessageText("research", "msg-r1", "I'll search for AI market data. ");

      // Research agent uses a tool
      store.startToolCall("research", "tc-r1", "web_search");
      store.updateToolCallArgs("tc-r1", '{"query": "AI market size 2025"}');
      store.endToolCall("tc-r1", "Found: $200B market size", "success", 320);

      // Research agent finishes
      store.appendMessageText("research", "msg-r1", "The AI market is worth $200B in 2025.");
      store.endMessage("research", "msg-r1");
      store.setAgentStatus("research", "complete");

      // Supervisor hands off to writer
      store.registerAgent("writer", {
        agentName: "Writer Agent",
        role: "writer",
        model: "claude-sonnet-4-6",
        tools: ["write_file"],
      });
      store.setAgentStatus("writer", "running");
      store.addTopic("writer", {
        id: "topic-writer-1",
        task: "Write a report on AI market findings",
        reason: "Research complete, need report",
        fromAgentId: "supervisor",
        startedAt: Date.now(),
      });

      // Writer streams with thinking
      store.startMessage("writer", "msg-w1", true);
      store.appendThinking("writer", "msg-w1", "I should structure this as an executive summary...");
      store.appendMessageText("writer", "msg-w1", "# AI Market Report 2025\n\nThe global AI market...");
      store.endMessage("writer", "msg-w1");
      store.setAgentStatus("writer", "complete");

      // Workflow completes
      store.setWorkflowStatus("complete");

      // Verify final state
      const state = useConversationStore.getState();
      expect(state.workflowStatus).toBe("complete");
      expect(state.agentOrder).toEqual(["supervisor", "research", "writer"]);

      // Research agent
      const research = state.agents.research!;
      expect(research.status).toBe("complete");
      expect(research.topics).toHaveLength(1);
      expect(research.topics[0]!.task).toBe("Find AI market data for 2025");
      expect(research.topics[0]!.messages).toHaveLength(1);
      expect(research.topics[0]!.messages[0]!.toolCalls).toHaveLength(1);
      expect(research.topics[0]!.messages[0]!.toolCalls[0]!.toolName).toBe("web_search");
      expect(research.topics[0]!.messages[0]!.text).toContain("$200B");

      // Writer agent
      const writer = state.agents.writer!;
      expect(writer.status).toBe("complete");
      expect(writer.topics[0]!.messages[0]!.thinkingBlocks).toHaveLength(1);
      expect(writer.topics[0]!.messages[0]!.thinkingBlocks[0]!.text).toContain("executive summary");
      expect(writer.topics[0]!.messages[0]!.text).toContain("AI Market Report");
    });
  });
});
