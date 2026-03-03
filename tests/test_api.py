"""Tests for the FastAPI endpoints (no AI calls)."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


def _make_client(tmp_path: Path):
    """Create a test client with an isolated store."""
    from todo_assistant.storage import TodoStore
    store = TodoStore(path=tmp_path / "todos.json")

    import todo_assistant.server as srv
    srv.store = store
    srv.ai = None  # AI routes not tested here
    return TestClient(srv.app)


def test_create_and_list(tmp_path):
    client = _make_client(tmp_path)

    res = client.post("/api/todos", json={"title": "Buy milk", "priority": "high"})
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Buy milk"
    assert data["priority"] == "high"

    res = client.get("/api/todos")
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_update_and_get(tmp_path):
    client = _make_client(tmp_path)
    todo = client.post("/api/todos", json={"title": "Test"}).json()

    res = client.patch(f"/api/todos/{todo['id']}", json={"title": "Updated", "status": "done"})
    assert res.status_code == 200
    assert res.json()["title"] == "Updated"
    assert res.json()["status"] == "done"

    res = client.get(f"/api/todos/{todo['id']}")
    assert res.json()["status"] == "done"


def test_delete(tmp_path):
    client = _make_client(tmp_path)
    todo = client.post("/api/todos", json={"title": "Delete me"}).json()

    res = client.delete(f"/api/todos/{todo['id']}")
    assert res.status_code == 200

    res = client.get("/api/todos")
    assert len(res.json()) == 0


def test_subtasks(tmp_path):
    client = _make_client(tmp_path)
    parent = client.post("/api/todos", json={"title": "Parent"}).json()

    res = client.post(f"/api/todos/{parent['id']}/subtasks", json={"title": "Child"})
    assert res.status_code == 201

    res = client.get(f"/api/todos/{parent['id']}")
    assert len(res.json()["subtasks"]) == 1


def test_search(tmp_path):
    client = _make_client(tmp_path)
    client.post("/api/todos", json={"title": "Buy groceries"})
    client.post("/api/todos", json={"title": "Fix car"})

    res = client.get("/api/todos?q=buy")
    assert len(res.json()) == 1
    assert res.json()[0]["title"] == "Buy groceries"


def test_clear_done(tmp_path):
    client = _make_client(tmp_path)
    t1 = client.post("/api/todos", json={"title": "Done task"}).json()
    client.post("/api/todos", json={"title": "Open task"})
    client.patch(f"/api/todos/{t1['id']}", json={"status": "done"})

    res = client.delete("/api/todos/actions/clear-done")
    assert res.json()["removed"] == 1

    res = client.get("/api/todos")
    assert len(res.json()) == 1


def test_serves_index(tmp_path):
    client = _make_client(tmp_path)
    res = client.get("/")
    assert res.status_code == 200
    assert "AI Todo Assistant" in res.text
