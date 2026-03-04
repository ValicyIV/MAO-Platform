"""FastAPI backend for the AI todo assistant."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import anthropic

from .models import Todo, Priority, Status
from .storage import TodoStore
from .ai_engine import AIEngine

app = FastAPI(title="AI Todo Assistant")

STATIC_DIR = Path(__file__).parent / "static"

store = TodoStore()
ai = AIEngine(store)


# -- Pydantic schemas --------------------------------------------------------

class TodoCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    category: str = ""
    due_date: Optional[str] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    due_date: Optional[str] = None


class ChatRequest(BaseModel):
    message: str


class SubtaskCreate(BaseModel):
    title: str


# -- API routes ---------------------------------------------------------------

@app.get("/api/todos")
def list_todos(status: Optional[str] = None, priority: Optional[str] = None,
               category: Optional[str] = None, q: Optional[str] = None):
    todos = store.todos
    if q:
        todos = store.search(q)
    if status:
        todos = [t for t in todos if t.status.value == status]
    if priority:
        todos = [t for t in todos if t.priority.value == priority]
    if category:
        todos = [t for t in todos if t.category.lower() == category.lower()]
    return [t.to_dict() for t in todos]


@app.post("/api/todos", status_code=201)
def create_todo(body: TodoCreate):
    try:
        pri = Priority(body.priority.lower())
    except ValueError:
        pri = Priority.MEDIUM
    todo = Todo(
        title=body.title,
        description=body.description,
        priority=pri,
        category=body.category,
        due_date=body.due_date,
    )
    store.add(todo)
    return todo.to_dict()


@app.get("/api/todos/{todo_id}")
def get_todo(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    return todo.to_dict()


@app.patch("/api/todos/{todo_id}")
def update_todo(todo_id: str, body: TodoUpdate):
    kwargs = {}
    if body.title is not None:
        kwargs["title"] = body.title
    if body.description is not None:
        kwargs["description"] = body.description
    if body.priority is not None:
        try:
            kwargs["priority"] = Priority(body.priority.lower())
        except ValueError:
            pass
    if body.status is not None:
        try:
            kwargs["status"] = Status(body.status.lower())
        except ValueError:
            pass
    if body.category is not None:
        kwargs["category"] = body.category
    if body.due_date is not None:
        kwargs["due_date"] = body.due_date

    todo = store.update(todo_id, **kwargs)
    if not todo:
        raise HTTPException(404, "Task not found")
    return todo.to_dict()


@app.delete("/api/todos/{todo_id}")
def delete_todo(todo_id: str):
    if not store.remove(todo_id):
        raise HTTPException(404, "Task not found")
    return {"ok": True}


@app.post("/api/todos/{todo_id}/subtasks", status_code=201)
def add_subtask(todo_id: str, body: SubtaskCreate):
    sub = Todo(title=body.title)
    result = store.add_subtask(todo_id, sub)
    if not result:
        raise HTTPException(404, "Parent task not found")
    return sub.to_dict()


@app.delete("/api/todos/actions/clear-done")
def clear_done():
    removed = store.clear_done()
    return {"removed": removed}


# -- AI routes ----------------------------------------------------------------

@app.post("/api/ai/breakdown/{todo_id}")
def ai_breakdown(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        return {"result": ai.suggest_breakdown(todo)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestions: {str(e)}")


@app.post("/api/ai/priority/{todo_id}")
def ai_priority(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        return {"result": ai.suggest_priority(todo)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestion: {str(e)}")


@app.post("/api/ai/nextstep/{todo_id}")
def ai_nextstep(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        return {"result": ai.suggest_next_step(todo)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestion: {str(e)}")


@app.post("/api/ai/category/{todo_id}")
def ai_category(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        existing = list({t.category for t in store.todos if t.category})
        return {"result": ai.suggest_category(todo, existing)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestion: {str(e)}")


@app.post("/api/ai/rewrite/{todo_id}")
def ai_rewrite(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        return {"result": ai.rewrite_task(todo)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestion: {str(e)}")


@app.post("/api/ai/assist/{todo_id}")
def ai_assist(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        return {"result": ai.assist_task(todo)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI suggestion: {str(e)}")


@app.post("/api/ai/auto-complete/{todo_id}")
def ai_auto_complete(todo_id: str):
    todo = store.get(todo_id)
    if not todo:
        raise HTTPException(404, "Task not found")
    try:
        plan = ai.auto_complete_task(todo)
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI plan: {str(e)}")

    # Apply the plan: update task fields and create subtasks
    updates = {}
    if plan["priority"]:
        try:
            updates["priority"] = Priority(plan["priority"])
        except ValueError:
            pass
    if plan["category"]:
        updates["category"] = plan["category"]
    if plan["improved_title"]:
        updates["title"] = plan["improved_title"]
    if plan["description"]:
        updates["description"] = plan["description"]
    updates["status"] = Status.IN_PROGRESS

    store.update(todo_id, **updates)

    created_subtasks = []
    for sub_title in plan["subtasks"]:
        sub = Todo(title=sub_title)
        store.add_subtask(todo_id, sub)
        created_subtasks.append(sub.to_dict())

    updated_todo = store.get(todo_id)
    return {
        "result": plan["summary"] or "Task has been set up and organized.",
        "raw": plan["raw"],
        "actions": {
            "priority_set": plan["priority"],
            "category_set": plan["category"],
            "title_rewritten": plan["improved_title"],
            "description_set": plan["description"],
            "subtasks_created": len(created_subtasks),
            "status_set": "in_progress",
        },
        "todo": updated_todo.to_dict() if updated_todo else None,
    }


@app.post("/api/ai/summary")
def ai_summary():
    try:
        return {"result": ai.daily_summary(store.todos)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI summary: {str(e)}")


@app.post("/api/ai/chat")
def ai_chat(body: ChatRequest):
    try:
        return {"result": ai.chat(body.message, store.todos)}
    except anthropic.APIError as e:
        raise HTTPException(502, f"AI service error: {e.message}")
    except Exception as e:
        raise HTTPException(500, f"Failed to get AI response: {str(e)}")


# -- Static files (frontend) --------------------------------------------------

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))
