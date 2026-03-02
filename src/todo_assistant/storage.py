"""JSON-based persistence for todos."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from .models import Todo


DEFAULT_PATH = Path.home() / ".todo_assistant" / "todos.json"


class TodoStore:
    """Reads and writes todos to a JSON file."""

    def __init__(self, path: Optional[Path] = None):
        self.path = path or DEFAULT_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._todos: list[Todo] = []
        self.load()

    # -- persistence -----------------------------------------------------------

    def load(self) -> None:
        if self.path.exists():
            data = json.loads(self.path.read_text())
            self._todos = [Todo.from_dict(t) for t in data]
        else:
            self._todos = []

    def save(self) -> None:
        self.path.write_text(json.dumps([t.to_dict() for t in self._todos], indent=2))

    # -- queries ---------------------------------------------------------------

    @property
    def todos(self) -> list[Todo]:
        return list(self._todos)

    def get(self, todo_id: str) -> Optional[Todo]:
        for t in self._todos:
            if t.id == todo_id:
                return t
            for s in t.subtasks:
                if s.id == todo_id:
                    return s
        return None

    def search(self, query: str) -> list[Todo]:
        query = query.lower()
        return [
            t
            for t in self._todos
            if query in t.title.lower()
            or query in t.description.lower()
            or query in t.category.lower()
        ]

    # -- mutations -------------------------------------------------------------

    def add(self, todo: Todo) -> Todo:
        self._todos.append(todo)
        self.save()
        return todo

    def remove(self, todo_id: str) -> bool:
        for i, t in enumerate(self._todos):
            if t.id == todo_id:
                self._todos.pop(i)
                self.save()
                return True
            for j, s in enumerate(t.subtasks):
                if s.id == todo_id:
                    t.subtasks.pop(j)
                    self.save()
                    return True
        return False

    def update(self, todo_id: str, **kwargs) -> Optional[Todo]:
        todo = self.get(todo_id)
        if todo is None:
            return None
        for key, value in kwargs.items():
            if hasattr(todo, key):
                setattr(todo, key, value)
        self.save()
        return todo

    def add_subtask(self, parent_id: str, subtask: Todo) -> Optional[Todo]:
        parent = self.get(parent_id)
        if parent is None:
            return None
        parent.subtasks.append(subtask)
        self.save()
        return subtask

    def clear_done(self) -> int:
        before = len(self._todos)
        self._todos = [t for t in self._todos if t.status.value != "done"]
        self.save()
        return before - len(self._todos)
