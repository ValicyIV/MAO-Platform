// WorkflowSidePanel.tsx — Right-side workflow thread + selected agent details.

import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graphStore";
import { useConversationStore } from "@/stores/conversationStore";
import type { AgentEntry, MessageEntry, ThinkingBlock, ToolCallEntry, TopicEntry } from "@/stores/conversationStore";
import { useSelectedNode } from "@/stores/selectors/graphSelectors";
import { NodeLevel } from "@mao/shared-types";
import type { SpecialistNodeData } from "@mao/shared-types";
import { modelDisplayName, modelBadgeClasses } from "@/utils/modelUtils";

const ROLE_COLORS: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  supervisor:   { dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-950/20",  border: "border-amber-800/30" },
  orchestrator: { dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-950/20",  border: "border-amber-800/30" },
  research:     { dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-950/20",   border: "border-blue-800/30" },
  code:         { dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-950/20",  border: "border-green-800/30" },
  data:         { dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-950/20", border: "border-purple-800/30" },
  writer:       { dot: "bg-pink-400",   text: "text-pink-400",   bg: "bg-pink-950/20",   border: "border-pink-800/30" },
  verifier:     { dot: "bg-cyan-400",   text: "text-cyan-400",   bg: "bg-cyan-950/20",   border: "border-cyan-800/30" },
};

const DEFAULT_COLOR = {
  dot: "bg-neutral-400",
  text: "text-neutral-400",
  bg: "bg-neutral-900",
  border: "border-neutral-700",
};

function roleColor(role: string) {
  return ROLE_COLORS[role.toLowerCase()] ?? DEFAULT_COLOR;
}

function getSelectedAgentId(node: ReturnType<typeof useSelectedNode>): string | null {
  if (!node) return null;
  const d = node.data;
  if ("agentId" in d && typeof d.agentId === "string" && d.agentId !== "unknown") return d.agentId;
  if ("level" in d && d.level === NodeLevel.Specialist) return node.id;
  return null;
}

function ThinkingBlockView({ block }: { block: ThinkingBlock }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-violet-400">Thought</span>
        {block.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />}
      </div>
      <pre className="whitespace-pre-wrap break-words text-[11px] leading-5 text-neutral-500">
        {block.text}
      </pre>
    </div>
  );
}

function ToolCallView({ toolCall }: { toolCall: ToolCallEntry }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-orange-400">{toolCall.toolName}</span>
        <span className="text-[10px] text-neutral-500">
          {toolCall.status}
          {toolCall.durationMs != null && ` • ${toolCall.durationMs}ms`}
        </span>
      </div>
      {toolCall.args && (
        <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-4 text-neutral-600">
          {toolCall.args}
        </pre>
      )}
      {toolCall.result && (
        <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] leading-4 text-neutral-500">
          {toolCall.result}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  topic,
  agent,
  isHighlighted,
}: {
  msg: MessageEntry;
  topic: TopicEntry;
  agent: AgentEntry;
  isHighlighted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const rc = roleColor(agent.role);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const detailCount = msg.thinkingBlocks.length + msg.toolCalls.length;

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-all ${
        isHighlighted ? `${rc.bg} ${rc.border}` : "border-transparent hover:border-neutral-800 hover:bg-neutral-900/40"
      }`}
      onClick={() => setSelectedNodeId(agent.agentId)}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${rc.dot} ${msg.isStreaming ? "animate-pulse" : ""}`} />
        <span className={`text-xs font-semibold ${rc.text}`}>{agent.agentName}</span>
        <span className="text-[10px] text-neutral-600">{agent.role}</span>
      </div>

      <div className="mb-2 rounded border border-neutral-800/80 bg-neutral-950/70 px-2 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-neutral-600">Topic</p>
        <p className="mt-1 text-[11px] leading-4 text-neutral-400">{topic.task || "General"}</p>
      </div>

      <div className="text-xs leading-relaxed whitespace-pre-wrap break-words text-neutral-300">
        {msg.text || (msg.isStreaming ? (
          <span className="italic text-neutral-600">Generating…</span>
        ) : (
          <span className="italic text-neutral-700">No response captured</span>
        ))}
      </div>

      {detailCount > 0 && (
        <div className="mt-2">
          <button
            className="text-[11px] text-neutral-500 hover:text-neutral-300"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
          >
            {expanded ? "Hide details" : `Show details (${msg.thinkingBlocks.length} thoughts, ${msg.toolCalls.length} tools)`}
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              {msg.thinkingBlocks.map((block) => (
                <ThinkingBlockView key={block.id} block={block} />
              ))}
              {msg.toolCalls.map((toolCall) => (
                <ToolCallView key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationThread({ highlightAgentId }: { highlightAgentId: string | null }) {
  const agents = useConversationStore((s) => s.agents);
  const agentOrder = useConversationStore((s) => s.agentOrder);
  const workflowStatus = useConversationStore((s) => s.workflowStatus);
  const bottomRef = useRef<HTMLDivElement>(null);

  const allMessages: Array<{ msg: MessageEntry; topic: TopicEntry; agent: AgentEntry }> = [];
  for (const agentId of agentOrder) {
    const agent = agents[agentId];
    if (!agent) continue;
    for (const topic of agent.topics) {
      for (const msg of topic.messages) {
        allMessages.push({ msg, topic, agent });
      }
    }
  }

  allMessages.sort((a, b) => a.msg.startedAt - b.msg.startedAt);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  if (allMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-neutral-700">
        {workflowStatus === "running" ? "Waiting for agent messages…" : "Run a workflow to see the thread"}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
      {allMessages.map(({ msg, topic, agent }) => (
        <MessageBubble
          key={`${agent.agentId}-${msg.id}`}
          msg={msg}
          topic={topic}
          agent={agent}
          isHighlighted={highlightAgentId === agent.agentId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function NodeDetailSection() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const node = useSelectedNode();

  if (!selectedNodeId || !node) return null;

  const data = node.data;
  const isSpecialist = "level" in data && data.level === NodeLevel.Specialist;
  if (!isSpecialist) return null;

  const specialist = data as SpecialistNodeData;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950/80 shrink-0">
      <div className="px-3 py-2 border-b border-neutral-800/60">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Selected Agent</p>
        <p className="mt-1 text-sm font-semibold text-neutral-200">{specialist.agentName}</p>
      </div>

      <div className="px-3 py-3 space-y-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Topic</p>
          <p className="mt-1 leading-5 text-neutral-300">{specialist.currentTopic || "No delegated topic yet"}</p>
          {specialist.topicReason && (
            <p className="mt-1 leading-5 text-neutral-500">{specialist.topicReason}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 font-mono ${modelBadgeClasses(specialist.model)}`}>
            {modelDisplayName(specialist.model)}
          </span>
          <span className="text-neutral-500">{specialist.role}</span>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Tools</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {specialist.tools.length > 0 ? specialist.tools.map((tool) => (
              <span
                key={tool}
                className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400"
              >
                {tool}
              </span>
            )) : (
              <span className="text-neutral-600">No tools registered</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowSidePanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const workflowStatus = useConversationStore((s) => s.workflowStatus);
  const agentOrder = useConversationStore((s) => s.agentOrder);
  const agents = useConversationStore((s) => s.agents);
  const selectedNode = useSelectedNode();
  const highlightAgentId = getSelectedAgentId(selectedNode);

  const activeAgents = agentOrder.map((id) => agents[id]).filter((agent): agent is AgentEntry => !!agent);

  return (
    <div className="w-96 border-l border-neutral-800 bg-neutral-950 flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400">Agent Thread</span>
          {workflowStatus === "running" && <span className="text-[10px] text-blue-400 animate-pulse">live</span>}
          {workflowStatus === "complete" && <span className="text-[10px] text-green-500">done</span>}
        </div>

        {activeAgents.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {activeAgents.map((agent) => {
              const rc = roleColor(agent.role);
              const isSelected = highlightAgentId === agent.agentId;
              return (
                <button
                  key={agent.agentId}
                  onClick={() => useGraphStore.getState().setSelectedNodeId(agent.agentId)}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-all ${
                    isSelected
                      ? `${rc.border} ${rc.bg} ${rc.text}`
                      : "border-neutral-800 text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${rc.dot} ${agent.status === "running" ? "animate-pulse" : ""}`} />
                  {agent.agentName}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ConversationThread highlightAgentId={highlightAgentId} />
      {selectedNodeId && <NodeDetailSection />}
    </div>
  );
}
