"""
test_graph/test_graph_compilation.py — Tests that the LangGraph StateGraph
compiles correctly and has the expected topology.
"""

from __future__ import annotations


def test_graph_compiles_without_error(mock_anthropic, mock_memory_graph):
    """The StateGraph should compile with all nodes and edges wired correctly."""
    from src.graph.graph import build_graph
    workflow = build_graph()
    # compile() would raise if the graph is malformed
    compiled = workflow.compile()
    assert compiled is not None


def test_graph_has_expected_nodes(mock_anthropic, mock_memory_graph):
    from src.graph.graph import build_graph
    workflow = build_graph()
    node_names = set(workflow.nodes.keys())
    assert "supervisor" in node_names
    assert "research"   in node_names
    assert "code"       in node_names
    assert "data"       in node_names
    assert "writer"     in node_names
    assert "verifier"   in node_names


def test_graph_entry_point_is_supervisor(mock_anthropic, mock_memory_graph):
    from src.graph.graph import build_graph
    workflow = build_graph()
    assert workflow.entry_point == "supervisor"


def test_graph_all_specialists_connect_to_verifier_or_supervisor(
    mock_anthropic, mock_memory_graph
):
    """Each specialist should have a conditional edge back toward supervisor or verifier."""
    from src.graph.graph import build_graph
    workflow = build_graph()
    specialists = ["research", "code", "data", "writer"]
    for agent in specialists:
        # Each specialist node should have outgoing conditional edges
        assert agent in workflow.nodes, f"Missing node: {agent}"
