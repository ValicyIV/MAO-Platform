"""
a2a/agent_cards.py — Agent Card definitions for A2A protocol.

Each specialist exposed via A2A gets an AgentCard describing its
capabilities. These are served at /.well-known/agent-card.json
(handled by the executor router).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AgentSkill:
    id: str
    name: str
    description: str
    input_modes: list[str] = field(default_factory=lambda: ["text/plain"])
    output_modes: list[str] = field(default_factory=lambda: ["text/plain"])


@dataclass
class AgentCard:
    name: str
    description: str
    url: str
    version: str = "0.1.0"
    skills: list[AgentSkill] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "url": self.url,
            "version": self.version,
            "skills": [
                {
                    "id": s.id,
                    "name": s.name,
                    "description": s.description,
                    "inputModes": s.input_modes,
                    "outputModes": s.output_modes,
                }
                for s in self.skills
            ],
        }


# ── Agent card registry ───────────────────────────────────────────────────────

AGENT_CARDS: dict[str, AgentCard] = {
    "research": AgentCard(
        name="MAO Research Agent",
        description="Searches the web, reads documents, and synthesises research findings.",
        url="/a2a/research",
        skills=[
            AgentSkill(
                id="web_research",
                name="Web Research",
                description="Search the web and summarise findings on any topic.",
            ),
            AgentSkill(
                id="arxiv_search",
                name="Academic Search",
                description="Search and summarise academic papers from arXiv.",
            ),
        ],
    ),
    "code": AgentCard(
        name="MAO Code Agent",
        description="Writes, executes, and debugs code across multiple languages.",
        url="/a2a/code",
        skills=[
            AgentSkill(
                id="code_generation",
                name="Code Generation",
                description="Write code in Python, TypeScript, and other languages.",
            ),
        ],
    ),
    "data": AgentCard(
        name="MAO Data Agent",
        description="Analyses data, runs queries, and generates visualisations.",
        url="/a2a/data",
        skills=[
            AgentSkill(
                id="data_analysis",
                name="Data Analysis",
                description="Analyse datasets and produce insights.",
            ),
        ],
    ),
    "writer": AgentCard(
        name="MAO Writer Agent",
        description="Composes and edits documents, reports, and prose.",
        url="/a2a/writer",
        skills=[
            AgentSkill(
                id="document_writing",
                name="Document Writing",
                description="Write and edit documents in markdown or plain text.",
            ),
        ],
    ),
}
