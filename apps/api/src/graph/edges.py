from __future__ import annotations
from langgraph.graph import END
from src.graph.state import OrchestratorState

VALID_AGENTS = {"research", "code", "data", "writer"}

def route_to_agent(state: OrchestratorState) -> str:
    next_agent = state.get("next", "")
    if not next_agent or next_agent == "FINISH":
        return END
    if next_agent in VALID_AGENTS:
        return next_agent
    return END

def should_verify(state: OrchestratorState) -> str:
    from src.config.settings import settings
    outputs = state.get("agent_outputs", {})
    current_agent = state.get("current_agent", "")
    if not current_agent or current_agent not in outputs:
        return "supervisor"
    output_str = str(outputs.get(current_agent, ""))
    edit_indicators = ["write_file", "edit_file", "create_file", "modified", "updated", "created"]
    edit_count = sum(output_str.lower().count(ind) for ind in edit_indicators)
    if edit_count >= settings.verification_threshold:
        return "verifier"
    return "supervisor"

def should_continue(state: OrchestratorState) -> str:
    if state.get("is_complete") or state.get("error"):
        return END
    return "supervisor"
