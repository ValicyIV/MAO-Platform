"""Todo data models."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

    def __str__(self) -> str:
        return self.value


class Status(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"

    def __str__(self) -> str:
        return self.value


@dataclass
class Todo:
    title: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    description: str = ""
    priority: Priority = Priority.MEDIUM
    status: Status = Status.TODO
    category: str = ""
    subtasks: list[Todo] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    due_date: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "priority": self.priority.value,
            "status": self.status.value,
            "category": self.category,
            "subtasks": [s.to_dict() for s in self.subtasks],
            "created_at": self.created_at,
            "due_date": self.due_date,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Todo:
        return cls(
            id=data["id"],
            title=data["title"],
            description=data.get("description", ""),
            priority=Priority(data.get("priority", "medium")),
            status=Status(data.get("status", "todo")),
            category=data.get("category", ""),
            subtasks=[cls.from_dict(s) for s in data.get("subtasks", [])],
            created_at=data.get("created_at", datetime.now().isoformat()),
            due_date=data.get("due_date"),
        )

    @property
    def is_complete(self) -> bool:
        return self.status == Status.DONE
