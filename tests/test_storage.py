"""Tests for todo storage."""

from pathlib import Path

from todo_assistant.models import Priority, Status, Todo
from todo_assistant.storage import TodoStore


def test_add_and_get(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    t = Todo(title="Test task")
    store.add(t)

    assert len(store.todos) == 1
    assert store.get(t.id) is not None
    assert store.get(t.id).title == "Test task"


def test_persistence(tmp_path: Path):
    path = tmp_path / "todos.json"
    store = TodoStore(path=path)
    store.add(Todo(title="Persist me"))

    store2 = TodoStore(path=path)
    assert len(store2.todos) == 1
    assert store2.todos[0].title == "Persist me"


def test_remove(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    t = Todo(title="Remove me")
    store.add(t)
    assert store.remove(t.id)
    assert len(store.todos) == 0


def test_update(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    t = Todo(title="Old title")
    store.add(t)
    store.update(t.id, title="New title", priority=Priority.HIGH)
    updated = store.get(t.id)
    assert updated.title == "New title"
    assert updated.priority == Priority.HIGH


def test_subtasks(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    parent = Todo(title="Parent")
    store.add(parent)

    sub = Todo(title="Child")
    store.add_subtask(parent.id, sub)

    assert len(store.get(parent.id).subtasks) == 1
    assert store.get(sub.id).title == "Child"


def test_search(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    store.add(Todo(title="Buy groceries", category="shopping"))
    store.add(Todo(title="Fix bug", category="work"))
    store.add(Todo(title="Buy new keyboard", category="shopping"))

    results = store.search("buy")
    assert len(results) == 2

    results = store.search("work")
    assert len(results) == 1


def test_clear_done(tmp_path: Path):
    store = TodoStore(path=tmp_path / "todos.json")
    store.add(Todo(title="Done task", status=Status.DONE))
    store.add(Todo(title="Open task", status=Status.TODO))

    removed = store.clear_done()
    assert removed == 1
    assert len(store.todos) == 1
    assert store.todos[0].title == "Open task"
