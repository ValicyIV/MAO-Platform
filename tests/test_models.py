"""Tests for todo models."""

from todo_assistant.models import Priority, Status, Todo


def test_todo_defaults():
    t = Todo(title="Buy groceries")
    assert t.title == "Buy groceries"
    assert t.priority == Priority.MEDIUM
    assert t.status == Status.TODO
    assert t.subtasks == []
    assert not t.is_complete


def test_todo_roundtrip():
    t = Todo(
        title="Deploy app",
        description="Push to production",
        priority=Priority.HIGH,
        status=Status.IN_PROGRESS,
        category="work",
    )
    t.subtasks.append(Todo(title="Run tests", status=Status.DONE))

    data = t.to_dict()
    restored = Todo.from_dict(data)

    assert restored.title == t.title
    assert restored.description == t.description
    assert restored.priority == t.priority
    assert restored.status == t.status
    assert restored.category == t.category
    assert len(restored.subtasks) == 1
    assert restored.subtasks[0].title == "Run tests"
    assert restored.subtasks[0].is_complete


def test_is_complete():
    t = Todo(title="Test", status=Status.DONE)
    assert t.is_complete

    t2 = Todo(title="Test2", status=Status.TODO)
    assert not t2.is_complete
