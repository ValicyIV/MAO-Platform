"""Interactive CLI for the AI todo assistant."""

from __future__ import annotations

import sys

from prompt_toolkit import prompt as pt_prompt
from prompt_toolkit.completion import WordCompleter
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .ai_engine import AIEngine
from .models import Priority, Status, Todo
from .storage import TodoStore

console = Console()

COMMANDS = [
    "add", "list", "done", "remove", "view", "edit",
    "start", "subtask", "breakdown", "priority", "nextstep",
    "category", "summary", "chat", "search", "clear-done",
    "assist", "auto-complete",
    "help", "quit",
]

HELP_TEXT = """\
[bold]Commands:[/bold]
  [cyan]add[/cyan]         Add a new task
  [cyan]list[/cyan]        Show all tasks (optionally filter by status/priority/category)
  [cyan]view[/cyan] ID     View task details
  [cyan]edit[/cyan] ID     Edit a task's title or description
  [cyan]done[/cyan] ID     Mark a task as done
  [cyan]start[/cyan] ID    Mark a task as in-progress
  [cyan]remove[/cyan] ID   Delete a task
  [cyan]subtask[/cyan] ID  Add a subtask to a task
  [cyan]search[/cyan]      Search tasks by keyword

[bold]AI-powered:[/bold]
  [cyan]assist[/cyan] ID         Get detailed step-by-step guidance for a task
  [cyan]auto-complete[/cyan] ID  Let AI organize the task: set priority, category, create subtasks
  [cyan]breakdown[/cyan] ID      Ask AI to break a task into subtasks
  [cyan]priority[/cyan] ID       Ask AI to suggest a priority
  [cyan]nextstep[/cyan] ID       Ask AI what to do next
  [cyan]category[/cyan] ID       Ask AI to suggest a category
  [cyan]summary[/cyan]           Get a daily summary & focus advice
  [cyan]chat[/cyan]               Free-form chat with the AI about your tasks

[bold]Housekeeping:[/bold]
  [cyan]clear-done[/cyan]   Remove all completed tasks
  [cyan]help[/cyan]         Show this help message
  [cyan]quit[/cyan]         Exit the assistant
"""

PRIORITY_STYLES = {
    Priority.LOW: "dim",
    Priority.MEDIUM: "white",
    Priority.HIGH: "yellow",
    Priority.URGENT: "bold red",
}

STATUS_LABELS = {
    Status.TODO: (" ", "white"),
    Status.IN_PROGRESS: (">", "cyan"),
    Status.DONE: ("x", "green"),
}


def _build_table(todos: list[Todo]) -> Table:
    table = Table(show_header=True, header_style="bold", expand=True)
    table.add_column("", width=1)
    table.add_column("ID", style="dim", width=8)
    table.add_column("Task")
    table.add_column("Priority", width=8)
    table.add_column("Category", width=12)
    table.add_column("Subtasks", width=8, justify="right")

    for t in todos:
        marker, marker_style = STATUS_LABELS[t.status]
        pri_style = PRIORITY_STYLES[t.priority]
        sub_count = ""
        if t.subtasks:
            done = sum(1 for s in t.subtasks if s.is_complete)
            sub_count = f"{done}/{len(t.subtasks)}"

        table.add_row(
            Text(marker, style=marker_style),
            t.id,
            Text(t.title, style="strike" if t.is_complete else ""),
            Text(str(t.priority), style=pri_style),
            t.category or "-",
            sub_count,
        )
    return table


def _input(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    return pt_prompt(f"  {label}{suffix}: ").strip() or default


class App:
    def __init__(self):
        self.store = TodoStore()
        self.ai = AIEngine(self.store)
        self.completer = WordCompleter(COMMANDS, ignore_case=True)

    def run(self) -> None:
        console.print(
            Panel(
                "[bold]AI Todo Assistant[/bold]\nType [cyan]help[/cyan] for commands, "
                "[cyan]chat[/cyan] to talk to the AI.",
                border_style="bright_blue",
            )
        )

        while True:
            try:
                raw = pt_prompt("todo> ", completer=self.completer).strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not raw:
                continue

            parts = raw.split(maxsplit=1)
            cmd = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else ""

            handler = getattr(self, f"cmd_{cmd.replace('-', '_')}", None)
            if handler:
                try:
                    handler(arg)
                except anthropic_error():
                    console.print("[red]AI request failed. Is your ANTHROPIC_API_KEY set?[/red]")
                except Exception as e:
                    console.print(f"[red]Error: {e}[/red]")
            else:
                console.print(f"Unknown command: [bold]{cmd}[/bold]. Type [cyan]help[/cyan].")

    # -- command handlers ------------------------------------------------------

    def cmd_add(self, _arg: str) -> None:
        title = _input("Title")
        if not title:
            return
        desc = _input("Description (optional)")
        pri_str = _input("Priority (low/medium/high/urgent)", "medium")
        category = _input("Category (optional)")

        try:
            priority = Priority(pri_str.lower())
        except ValueError:
            priority = Priority.MEDIUM

        todo = Todo(title=title, description=desc, priority=priority, category=category)
        self.store.add(todo)
        console.print(f"  [green]Added:[/green] {todo.title} [dim]({todo.id})[/dim]")

    def cmd_list(self, arg: str) -> None:
        todos = self.store.todos
        if not todos:
            console.print("  No tasks yet. Use [cyan]add[/cyan] to create one.")
            return

        if arg:
            key = arg.lower()
            todos = [
                t for t in todos
                if key in (t.status.value, t.priority.value, t.category.lower())
            ]

        if not todos:
            console.print(f"  No tasks match filter [bold]{arg}[/bold].")
            return

        console.print(_build_table(todos))

    def cmd_view(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return

        lines = [
            f"[bold]{todo.title}[/bold]",
            f"ID: {todo.id}  |  Status: {todo.status}  |  Priority: {todo.priority}",
        ]
        if todo.description:
            lines.append(f"\n{todo.description}")
        if todo.category:
            lines.append(f"\nCategory: {todo.category}")
        if todo.due_date:
            lines.append(f"Due: {todo.due_date}")

        if todo.subtasks:
            lines.append("\n[bold]Subtasks:[/bold]")
            for s in todo.subtasks:
                marker = "x" if s.is_complete else " "
                lines.append(f"  [{marker}] {s.title} [dim]({s.id})[/dim]")

        console.print(Panel("\n".join(lines), border_style="blue"))

    def cmd_edit(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        title = _input("Title", todo.title)
        desc = _input("Description", todo.description)
        self.store.update(todo_id, title=title, description=desc)
        console.print("  [green]Updated.[/green]")

    def cmd_done(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        self.store.update(todo_id, status=Status.DONE)
        console.print(f"  [green]Completed:[/green] {todo.title}")

    def cmd_start(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        self.store.update(todo_id, status=Status.IN_PROGRESS)
        console.print(f"  [cyan]Started:[/cyan] {todo.title}")

    def cmd_remove(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        self.store.remove(todo_id)
        console.print(f"  [red]Removed:[/red] {todo.title}")

    def cmd_subtask(self, todo_id: str) -> None:
        parent = self._require(todo_id)
        if not parent:
            return
        title = _input("Subtask title")
        if not title:
            return
        sub = Todo(title=title)
        self.store.add_subtask(todo_id, sub)
        console.print(f"  [green]Added subtask:[/green] {sub.title} [dim]({sub.id})[/dim]")

    def cmd_search(self, query: str) -> None:
        if not query:
            query = _input("Search")
        results = self.store.search(query)
        if not results:
            console.print("  No matches.")
            return
        console.print(_build_table(results))

    def cmd_clear_done(self, _arg: str) -> None:
        removed = self.store.clear_done()
        console.print(f"  Cleared {removed} completed task(s).")

    # -- AI commands -----------------------------------------------------------

    def cmd_assist(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        console.print("  [dim]Analyzing task and preparing guidance...[/dim]")
        result = self.ai.assist_task(todo)
        console.print(Panel(result, title="Step-by-Step Guidance", border_style="bright_blue"))

    def cmd_auto_complete(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        console.print("  [dim]AI agent is working on your task...[/dim]")
        plan = self.ai.auto_complete_task(todo)

        # Apply the plan
        updates = {}
        actions = []

        if plan["priority"]:
            try:
                updates["priority"] = Priority(plan["priority"])
                actions.append(f"Priority → {plan['priority']}")
            except ValueError:
                pass
        if plan["category"]:
            updates["category"] = plan["category"]
            actions.append(f"Category → {plan['category']}")
        if plan["improved_title"]:
            updates["title"] = plan["improved_title"]
            actions.append(f"Title rewritten")
        if plan["description"]:
            updates["description"] = plan["description"]
            actions.append(f"Description set")
        updates["status"] = Status.IN_PROGRESS
        actions.append("Status → in_progress")

        self.store.update(todo_id, **updates)

        subtask_count = 0
        for sub_title in plan["subtasks"]:
            sub = Todo(title=sub_title)
            self.store.add_subtask(todo_id, sub)
            subtask_count += 1

        if subtask_count:
            actions.append(f"{subtask_count} subtask(s) created")

        action_text = "\n".join(f"  [green]✓[/green] {a}" for a in actions)
        summary = plan["summary"] or "Task has been set up and organized."

        console.print(Panel(
            f"[bold]Actions taken:[/bold]\n{action_text}\n\n{summary}",
            title="Auto-Complete Results",
            border_style="green",
        ))

    def cmd_breakdown(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.suggest_breakdown(todo)
        console.print(Panel(result, title="Suggested subtasks", border_style="green"))

        if _input("Add these as subtasks? (y/n)", "n").lower() == "y":
            for line in result.strip().splitlines():
                cleaned = line.lstrip("0123456789.) -").strip()
                if cleaned:
                    sub = Todo(title=cleaned)
                    self.store.add_subtask(todo_id, sub)
            console.print("  [green]Subtasks added![/green]")

    def cmd_priority(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.suggest_priority(todo)
        console.print(Panel(result, title="Priority suggestion", border_style="yellow"))

    def cmd_nextstep(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.suggest_next_step(todo)
        console.print(Panel(result, title="Next step", border_style="cyan"))

    def cmd_category(self, todo_id: str) -> None:
        todo = self._require(todo_id)
        if not todo:
            return
        existing = list({t.category for t in self.store.todos if t.category})
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.suggest_category(todo, existing)
        console.print(f"  Suggested category: [bold]{result}[/bold]")
        if _input("Apply? (y/n)", "y").lower() == "y":
            self.store.update(todo_id, category=result)
            console.print("  [green]Category set.[/green]")

    def cmd_summary(self, _arg: str) -> None:
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.daily_summary(self.store.todos)
        console.print(Panel(result, title="Daily Summary", border_style="bright_blue"))

    def cmd_chat(self, message: str) -> None:
        if not message:
            message = _input("You")
        if not message:
            return
        console.print("  [dim]Thinking...[/dim]")
        result = self.ai.chat(message, self.store.todos)
        console.print(Panel(result, title="AI Assistant", border_style="magenta"))

    # -- helpers ---------------------------------------------------------------

    def cmd_help(self, _arg: str) -> None:
        console.print(HELP_TEXT)

    def cmd_quit(self, _arg: str) -> None:
        console.print("Bye!")
        raise SystemExit(0)

    def _require(self, todo_id: str) -> Todo | None:
        if not todo_id:
            console.print("  [red]Please provide a task ID.[/red]")
            return None
        todo = self.store.get(todo_id)
        if not todo:
            console.print(f"  [red]Task {todo_id} not found.[/red]")
        return todo


def anthropic_error():
    """Return the base Anthropic API error class for exception handling."""
    import anthropic
    return anthropic.APIError


def main():
    try:
        App().run()
    except KeyboardInterrupt:
        console.print("\nBye!")


if __name__ == "__main__":
    main()
