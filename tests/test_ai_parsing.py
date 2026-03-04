"""Tests for AI response parsing in auto_complete_task and breakdown flows."""

from pathlib import Path
from unittest.mock import patch, MagicMock

from todo_assistant.ai_engine import AIEngine
from todo_assistant.models import Todo
from todo_assistant.storage import TodoStore


def _make_engine(tmp_path: Path) -> AIEngine:
    store = TodoStore(path=tmp_path / "todos.json")
    return AIEngine(store)


def _parse(engine: AIEngine, raw: str) -> dict:
    """Call auto_complete_task with a mocked AI response."""
    todo = Todo(title="Test task")
    engine.store.add(todo)
    with patch.object(engine, "_ask", return_value=raw):
        return engine.auto_complete_task(todo)


# -- auto_complete_task parsing -----------------------------------------------


def test_standard_format(tmp_path):
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "PRIORITY: high\n"
        "CATEGORY: development\n"
        "IMPROVED_TITLE: Build a responsive website\n"
        "DESCRIPTION: Create a modern website\n"
        "SUBTASK: Set up project\n"
        "SUBTASK: Create components\n"
        "SUBTASK: Add styling\n"
        "SUMMARY: Organized the project"
    ))
    assert result["priority"] == "high"
    assert result["category"] == "development"
    assert result["improved_title"] == "Build a responsive website"
    assert result["description"] == "Create a modern website"
    assert len(result["subtasks"]) == 3
    assert result["subtasks"] == ["Set up project", "Create components", "Add styling"]
    assert result["summary"] == "Organized the project"


def test_subtasks_plural_header(tmp_path):
    """SUBTASKS: (plural) followed by a list should be parsed correctly."""
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "PRIORITY: high\n"
        "CATEGORY: development\n"
        "IMPROVED_TITLE: Build a website\n"
        "DESCRIPTION: Create a website\n"
        "SUBTASKS:\n"
        "1. Set up project\n"
        "2. Create components\n"
        "3. Add styling\n"
        "SUMMARY: Done"
    ))
    assert len(result["subtasks"]) == 3
    assert result["subtasks"] == ["Set up project", "Create components", "Add styling"]


def test_subtasks_plural_with_bullets(tmp_path):
    """SUBTASKS: followed by bullet points should work."""
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "PRIORITY: medium\n"
        "CATEGORY: work\n"
        "IMPROVED_TITLE: Plan project\n"
        "DESCRIPTION: Plan the project\n"
        "SUBTASKS:\n"
        "- Design database schema\n"
        "- Build API endpoints\n"
        "- Create frontend\n"
        "SUMMARY: Ready to go"
    ))
    assert len(result["subtasks"]) == 3
    assert result["subtasks"][0] == "Design database schema"


def test_markdown_bold_keywords(tmp_path):
    """Keywords wrapped in markdown bold should be recognized."""
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "**PRIORITY:** high\n"
        "**CATEGORY:** development\n"
        "**IMPROVED_TITLE:** Build a website\n"
        "**DESCRIPTION:** Create a website\n"
        "**SUBTASK:** Set up project\n"
        "**SUBTASK:** Create components\n"
        "**SUBTASK:** Add styling\n"
        "**SUMMARY:** Done"
    ))
    assert len(result["subtasks"]) == 3
    assert result["priority"] == "high"


def test_numbered_subtask_values_stripped(tmp_path):
    """Number prefixes inside SUBTASK: values should be stripped."""
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "PRIORITY: high\n"
        "CATEGORY: dev\n"
        "IMPROVED_TITLE: Task\n"
        "DESCRIPTION: Do it\n"
        "SUBTASK: 1. Set up project\n"
        "SUBTASK: 2. Create components\n"
        "SUBTASK: 3. Add styling\n"
        "SUMMARY: Done"
    ))
    assert result["subtasks"] == ["Set up project", "Create components", "Add styling"]


def test_lowercase_keywords(tmp_path):
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "priority: medium\n"
        "category: personal\n"
        "improved_title: Clean the house\n"
        "description: Deep clean\n"
        "subtask: Kitchen\n"
        "subtask: Bathroom\n"
        "summary: Good plan"
    ))
    assert result["priority"] == "medium"
    assert len(result["subtasks"]) == 2


def test_extra_text_ignored(tmp_path):
    """Preamble and conclusion text should be ignored."""
    engine = _make_engine(tmp_path)
    result = _parse(engine, (
        "Here is my analysis:\n"
        "\n"
        "PRIORITY: high\n"
        "CATEGORY: dev\n"
        "IMPROVED_TITLE: Build API\n"
        "DESCRIPTION: Create REST API\n"
        "SUBTASK: Set up project\n"
        "SUBTASK: Create endpoints\n"
        "SUMMARY: Organized\n"
        "\n"
        "Let me know if you need anything else!"
    ))
    assert len(result["subtasks"]) == 2
    assert result["priority"] == "high"


def test_empty_response(tmp_path):
    engine = _make_engine(tmp_path)
    result = _parse(engine, "")
    assert result["subtasks"] == []
    assert result["priority"] is None


# -- breakdown endpoint integration ------------------------------------------


def test_breakdown_creates_subtasks(tmp_path):
    """The breakdown flow should create subtasks from AI suggestions."""
    from fastapi.testclient import TestClient

    store = TodoStore(path=tmp_path / "todos.json")

    import todo_assistant.server as srv
    srv.store = store
    mock_ai = MagicMock()
    srv.ai = mock_ai

    client = TestClient(srv.app)

    parent = client.post("/api/todos", json={"title": "Build website"}).json()

    mock_ai.suggest_breakdown.return_value = (
        "1. Research frameworks\n"
        "2. Set up project\n"
        "3. Create components"
    )
    res = client.post(f"/api/ai/breakdown/{parent['id']}")
    assert res.status_code == 200
    assert "Research frameworks" in res.json()["result"]


def test_auto_complete_creates_subtasks(tmp_path):
    """Auto-complete should parse AI response and create subtasks."""
    from fastapi.testclient import TestClient

    store = TodoStore(path=tmp_path / "todos.json")

    import todo_assistant.server as srv
    srv.store = store
    mock_ai = MagicMock()
    srv.ai = mock_ai

    client = TestClient(srv.app)

    parent = client.post("/api/todos", json={"title": "Build website"}).json()

    mock_ai.auto_complete_task.return_value = {
        "raw": "...",
        "priority": "high",
        "category": "development",
        "improved_title": "Build a responsive website",
        "description": "Create a modern website",
        "subtasks": ["Set up project", "Create components", "Add styling"],
        "summary": "Organized the project",
    }

    res = client.post(f"/api/ai/auto-complete/{parent['id']}")
    assert res.status_code == 200

    data = res.json()
    assert data["actions"]["subtasks_created"] == 3
    assert data["actions"]["priority_set"] == "high"

    # Verify subtasks were persisted
    todo = client.get(f"/api/todos/{parent['id']}").json()
    assert len(todo["subtasks"]) == 3
    assert todo["subtasks"][0]["title"] == "Set up project"
