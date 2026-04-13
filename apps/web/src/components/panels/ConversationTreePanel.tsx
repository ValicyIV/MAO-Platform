// ConversationTreePanel.tsx — Hierarchical agent conversation view
//
// Renders the exact structure requested:
//   Level 1: Agent name/role (collapsible)
//   Level 2: Topic of conversation (collapsible)
//   Level 3: Actual conversation messages
//   Level 4: Tool use + thinking (collapsible)
//
// Data source: conversationStore (populated by AGUIEventRouter)

import { useConversationStore } from "@/stores/conversationStore";
import type {
  AgentEntry,
  TopicEntry,
  MessageEntry,
  ToolCallEntry,
  ThinkingBlock,
} from "@/stores/conversationStore";

// ── Agent role → visual config ───────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  supervisor:   { color: "text-amber-400",  bg: "bg-amber-950/30",  border: "border-amber-800/40", icon: "\u{1F451}" },
  orchestrator: { color: "text-amber-400",  bg: "bg-amber-950/30",  border: "border-amber-800/40", icon: "\u{1F451}" },
  research:     { color: "text-blue-400",   bg: "bg-blue-950/30",   border: "border-blue-800/40",  icon: "\u{1F50D}" },
  code:         { color: "text-green-400",  bg: "bg-green-950/30",  border: "border-green-800/40", icon: "\u{1F4BB}" },
  data:         { color: "text-purple-400", bg: "bg-purple-950/30", border: "border-purple-800/40",icon: "\u{1F4CA}" },
  writer:       { color: "text-pink-400",   bg: "bg-pink-950/30",   border: "border-pink-800/40",  icon: "\u{270F}\u{FE0F}" },
  verifier:     { color: "text-cyan-400",   bg: "bg-cyan-950/30",   border: "border-cyan-800/40",  icon: "\u{2705}" },
};

const DEFAULT_ROLE_CONFIG = { color: "text-neutral-400", bg: "bg-neutral-900", border: "border-neutral-700", icon: "\u{1F916}" };

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role.toLowerCase()] ?? DEFAULT_ROLE_CONFIG;
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  idle:     { label: "Idle",     cls: "bg-neutral-700 text-neutral-300" },
  running:  { label: "Running",  cls: "bg-blue-600 text-white animate-pulse" },
  complete: { label: "Done",     cls: "bg-green-700 text-green-100" },
  error:    { label: "Error",    cls: "bg-red-700 text-red-100" },
};

// ── Chevron component ────────────────────────────────────────────────────────

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ── Level 4: Tool Call ───────────────────────────────────────────────────────

function ToolCallView({ tc }: { tc: ToolCallEntry }) {
  const statusCls =
    tc.status === "success" ? "text-green-400" :
    tc.status === "error" ? "text-red-400" :
    tc.status === "running" ? "text-blue-400 animate-pulse" :
    "text-neutral-500";

  return (
    <div className="ml-4 my-1 rounded border border-neutral-800 bg-neutral-900/60 text-xs">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-neutral-800/60">
        <span className="font-mono text-orange-400">{tc.toolName}</span>
        <span className={`ml-auto text-[10px] ${statusCls}`}>
          {tc.status}
          {tc.durationMs != null && ` \u2022 ${tc.durationMs}ms`}
        </span>
      </div>
      {tc.args && (
        <pre className="px-2 py-1 text-neutral-500 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
          {tc.args}
        </pre>
      )}
      {tc.result && (
        <pre className="px-2 py-1 border-t border-neutral-800/60 text-neutral-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {tc.result}
        </pre>
      )}
    </div>
  );
}

// ── Level 4: Thinking Block ──────────────────────────────────────────────────

function ThinkingBlockView({ block }: { block: ThinkingBlock }) {
  return (
    <div className="ml-4 my-1 rounded border border-neutral-800/50 bg-neutral-950 text-xs">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-neutral-800/40">
        <span className="text-neutral-600 text-[10px] italic">
          {block.isStreaming ? "Thinking..." : "Thought"}
        </span>
        {block.isStreaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
        )}
      </div>
      <pre className="px-2 py-1 text-neutral-600 whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
        {block.text || "..."}
      </pre>
    </div>
  );
}

// ── Level 3: Message ─────────────────────────────────────────────────────────

function MessageView({ msg }: { msg: MessageEntry }) {
  const expandedMessages = useConversationStore((s) => s.expandedMessages);
  const toggleMessage = useConversationStore((s) => s.toggleMessage);

  const hasDetails = msg.toolCalls.length > 0 || msg.thinkingBlocks.length > 0;
  const isExpanded = expandedMessages.has(msg.id);

  return (
    <div className="relative">
      {/* Message text */}
      <div className={`px-3 py-2 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap break-words ${msg.isStreaming ? "border-l-2 border-blue-500/60" : ""}`}>
        {msg.text || (msg.isStreaming ? (
          <span className="text-neutral-600 italic">Generating...</span>
        ) : (
          <span className="text-neutral-700 italic">Empty response</span>
        ))}
      </div>

      {/* Expand/collapse for tool calls + thinking */}
      {hasDetails && (
        <div className="px-2 pb-1">
          <button
            onClick={() => toggleMessage(msg.id)}
            className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <Chevron expanded={isExpanded} />
            <span>
              {msg.toolCalls.length > 0 && `${msg.toolCalls.length} tool call${msg.toolCalls.length > 1 ? "s" : ""}`}
              {msg.toolCalls.length > 0 && msg.thinkingBlocks.length > 0 && " \u2022 "}
              {msg.thinkingBlocks.length > 0 && `${msg.thinkingBlocks.length} thinking block${msg.thinkingBlocks.length > 1 ? "s" : ""}`}
            </span>
          </button>

          {isExpanded && (
            <div className="mt-1 space-y-1">
              {msg.thinkingBlocks.map((tb) => (
                <ThinkingBlockView key={tb.id} block={tb} />
              ))}
              {msg.toolCalls.map((tc) => (
                <ToolCallView key={tc.id} tc={tc} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Level 2: Topic ───────────────────────────────────────────────────────────

function TopicView({ topic }: { topic: TopicEntry }) {
  const expandedTopics = useConversationStore((s) => s.expandedTopics);
  const toggleTopic = useConversationStore((s) => s.toggleTopic);
  const isExpanded = expandedTopics.has(topic.id);

  return (
    <div className="border-l border-neutral-800/60 ml-3">
      {/* Topic header */}
      <button
        onClick={() => toggleTopic(topic.id)}
        className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 hover:bg-neutral-800/30 transition-colors"
      >
        <Chevron expanded={isExpanded} />
        <span className="text-xs font-medium text-neutral-300 truncate flex-1">
          {topic.task}
        </span>
        {topic.reason && (
          <span className="text-[10px] text-neutral-600 truncate max-w-[140px]">
            {topic.reason}
          </span>
        )}
        <span className="text-[10px] text-neutral-700 tabular-nums shrink-0">
          {topic.messages.length} msg{topic.messages.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Messages */}
      {isExpanded && (
        <div className="ml-2 border-l border-neutral-800/40">
          {topic.messages.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-700 italic">Awaiting response...</p>
          ) : (
            topic.messages.map((msg) => (
              <MessageView key={msg.id} msg={msg} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Level 1: Agent ───────────────────────────────────────────────────────────

function AgentSection({ agent }: { agent: AgentEntry }) {
  const expandedAgents = useConversationStore((s) => s.expandedAgents);
  const toggleAgent = useConversationStore((s) => s.toggleAgent);
  const isExpanded = expandedAgents.has(agent.agentId);
  const rc = getRoleConfig(agent.role);
  const badge = STATUS_BADGES[agent.status] ?? STATUS_BADGES.idle!;

  const totalMessages = agent.topics.reduce((sum, t) => sum + t.messages.length, 0);
  const totalTools = agent.topics.reduce(
    (sum, t) => sum + t.messages.reduce((ms, m) => ms + m.toolCalls.length, 0),
    0,
  );

  return (
    <div className={`rounded-lg border ${rc.border} ${rc.bg} overflow-hidden`}>
      {/* Agent header */}
      <button
        onClick={() => toggleAgent(agent.agentId)}
        className="flex items-center gap-2 w-full text-left px-3 py-2.5 hover:brightness-110 transition-all"
      >
        <Chevron expanded={isExpanded} />
        <span className="text-base">{rc.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${rc.color}`}>
              {agent.agentName}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-neutral-600 font-mono">{agent.role}</span>
            {agent.model && (
              <span className="text-[10px] text-neutral-700 font-mono truncate max-w-[120px]">
                {agent.model}
              </span>
            )}
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-neutral-600 tabular-nums shrink-0">
          {totalMessages > 0 && <span>{totalMessages} msg</span>}
          {totalTools > 0 && <span>{totalTools} tool</span>}
          {agent.tokenCount > 0 && <span>{(agent.tokenCount / 1000).toFixed(1)}k tok</span>}
        </div>
      </button>

      {/* Topics */}
      {isExpanded && (
        <div className="border-t border-neutral-800/40">
          {agent.topics.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-700 italic">No tasks assigned yet...</p>
          ) : (
            agent.topics.map((topic) => (
              <TopicView key={topic.id} topic={topic} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function ConversationTreePanel() {
  const agents = useConversationStore((s) => s.agents);
  const agentOrder = useConversationStore((s) => s.agentOrder);
  const workflowStatus = useConversationStore((s) => s.workflowStatus);

  const orderedAgents = agentOrder
    .map((id) => agents[id])
    .filter((a): a is AgentEntry => a !== undefined);

  if (orderedAgents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-700 text-sm">
        <div className="text-center">
          <p className="text-lg mb-1">No agents active</p>
          <p className="text-xs text-neutral-800">Run a workflow to see the conversation tree</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <span className="text-xs font-medium text-neutral-400">Agent Conversations</span>
        <span className="text-[10px] text-neutral-600">
          {orderedAgents.length} agent{orderedAgents.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        {workflowStatus === "running" && (
          <span className="text-[10px] text-blue-400 animate-pulse">Workflow running</span>
        )}
        {workflowStatus === "complete" && (
          <span className="text-[10px] text-green-500">Workflow complete</span>
        )}
        {workflowStatus === "error" && (
          <span className="text-[10px] text-red-400">Workflow error</span>
        )}
      </div>

      {/* Scrollable agent list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {orderedAgents.map((agent) => (
          <AgentSection key={agent.agentId} agent={agent} />
        ))}
      </div>
    </div>
  );
}
