"""AI engine powered by Claude for intelligent task assistance."""

from __future__ import annotations

from typing import Optional

import anthropic

from .models import Todo, Priority, Status
from .storage import TodoStore

SYSTEM_PROMPT = """\
You are a helpful, concise todo-list assistant. You help users:
- Break large tasks into smaller, actionable subtasks
- Prioritize work effectively
- Suggest next steps and approaches for completing tasks
- Organize tasks into meaningful categories
- Provide encouragement and practical advice

Keep responses short and actionable. Use plain text, no markdown.
When suggesting subtasks, return them as a numbered list.
When suggesting a priority, use one of: low, medium, high, urgent.
When suggesting a category, use a single short word or phrase.
"""


class AIEngine:
    """Wraps the Anthropic API to provide task-assistance features."""

    def __init__(self, store: TodoStore, model: str = "claude-sonnet-4-6"):
        self.client = anthropic.Anthropic()
        self.model = model
        self.store = store

    def _ask(self, user_message: str) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    # -- public helpers -------------------------------------------------------

    def suggest_breakdown(self, todo: Todo) -> str:
        prompt = (
            f"I have this task:\n"
            f"  Title: {todo.title}\n"
            f"  Description: {todo.description or '(none)'}\n"
            f"  Priority: {todo.priority}\n\n"
            f"Break it down into small, concrete subtasks I can act on right away. "
            f"Return a numbered list of subtask titles only."
        )
        return self._ask(prompt)

    def suggest_priority(self, todo: Todo) -> str:
        prompt = (
            f"Given this task, suggest a priority level (low / medium / high / urgent) "
            f"and briefly explain why.\n\n"
            f"  Title: {todo.title}\n"
            f"  Description: {todo.description or '(none)'}\n"
        )
        return self._ask(prompt)

    def suggest_next_step(self, todo: Todo) -> str:
        subtask_info = ""
        if todo.subtasks:
            done = [s for s in todo.subtasks if s.is_complete]
            remaining = [s for s in todo.subtasks if not s.is_complete]
            subtask_info = (
                f"\n  Completed subtasks: {', '.join(s.title for s in done) or 'none'}"
                f"\n  Remaining subtasks: {', '.join(s.title for s in remaining) or 'none'}"
            )

        prompt = (
            f"I'm working on this task:\n"
            f"  Title: {todo.title}\n"
            f"  Description: {todo.description or '(none)'}\n"
            f"  Status: {todo.status}"
            f"{subtask_info}\n\n"
            f"What should I do next? Give me one concrete, actionable next step."
        )
        return self._ask(prompt)

    def suggest_category(self, todo: Todo, existing_categories: list[str]) -> str:
        cats = ", ".join(existing_categories) if existing_categories else "(none yet)"
        prompt = (
            f"Suggest a short category name for this task. "
            f"Reuse an existing category if it fits.\n\n"
            f"  Task: {todo.title}\n"
            f"  Existing categories: {cats}\n\n"
            f"Reply with just the category name, nothing else."
        )
        return self._ask(prompt).strip()

    def daily_summary(self, todos: list[Todo]) -> str:
        if not todos:
            return "You have no tasks. Add some to get started!"

        lines = []
        for t in todos:
            sub = ""
            if t.subtasks:
                done = sum(1 for s in t.subtasks if s.is_complete)
                sub = f" [{done}/{len(t.subtasks)} subtasks]"
            lines.append(f"- [{t.priority}] {t.title} ({t.status}){sub}")

        task_list = "\n".join(lines)
        prompt = (
            f"Here are my current tasks:\n{task_list}\n\n"
            f"Give me a brief daily summary: what I should focus on today, "
            f"any priorities that need attention, and one motivational sentence."
        )
        return self._ask(prompt)

    def rewrite_task(self, todo: Todo) -> str:
        prompt = (
            f"Rewrite this vague or unclear task into a clear, specific, actionable one.\n\n"
            f"  Current title: {todo.title}\n"
            f"  Current description: {todo.description or '(none)'}\n\n"
            f"Reply in exactly this format (two lines, no extra text):\n"
            f"Title: <improved title>\n"
            f"Description: <one-sentence actionable description>"
        )
        return self._ask(prompt)

    def assist_task(self, todo: Todo) -> str:
        """Provide detailed, actionable guidance for completing a task."""
        subtask_info = ""
        if todo.subtasks:
            done = [s for s in todo.subtasks if s.is_complete]
            remaining = [s for s in todo.subtasks if not s.is_complete]
            subtask_info = (
                f"\n  Completed subtasks: {', '.join(s.title for s in done) or 'none'}"
                f"\n  Remaining subtasks: {', '.join(s.title for s in remaining) or 'none'}"
            )

        prompt = (
            f"I need detailed help completing this task:\n"
            f"  Title: {todo.title}\n"
            f"  Description: {todo.description or '(none)'}\n"
            f"  Priority: {todo.priority}\n"
            f"  Status: {todo.status}"
            f"{subtask_info}\n\n"
            f"Give me a comprehensive action plan with:\n"
            f"1. A clear step-by-step walkthrough of how to complete this task\n"
            f"2. Key considerations or pitfalls to watch out for\n"
            f"3. Helpful tips or best practices\n"
            f"4. An estimated effort level (quick / moderate / significant)\n\n"
            f"Be specific and practical. Tailor advice to this exact task."
        )
        return self._ask(prompt)

    def auto_complete_task(self, todo: Todo) -> dict:
        """Agentically analyze a task and return structured actions to take."""
        existing_cats = list({t.category for t in self.store.todos if t.category})
        cats = ", ".join(existing_cats) if existing_cats else "(none yet)"

        prompt = (
            f"Analyze this task and provide a complete action plan in the exact format below.\n\n"
            f"  Title: {todo.title}\n"
            f"  Description: {todo.description or '(none)'}\n"
            f"  Current priority: {todo.priority}\n"
            f"  Current category: {todo.category or '(none)'}\n"
            f"  Existing categories in use: {cats}\n\n"
            f"Respond in EXACTLY this format (keep each value on a single line):\n"
            f"PRIORITY: <low/medium/high/urgent>\n"
            f"CATEGORY: <short category name>\n"
            f"IMPROVED_TITLE: <clearer version of the title>\n"
            f"DESCRIPTION: <one-sentence actionable description>\n"
            f"SUBTASK: <first subtask title>\n"
            f"SUBTASK: <second subtask title>\n"
            f"SUBTASK: <third subtask title>\n"
            f"SUBTASK: <fourth subtask title if needed>\n"
            f"SUBTASK: <fifth subtask title if needed>\n"
            f"SUMMARY: <one sentence explaining what you set up and why>\n\n"
            f"Provide 3-6 concrete, actionable subtasks. Reuse an existing category if it fits."
        )
        raw = self._ask(prompt)

        # Parse the structured response
        result = {
            "raw": raw,
            "priority": None,
            "category": None,
            "improved_title": None,
            "description": None,
            "subtasks": [],
            "summary": "",
        }
        for line in raw.strip().splitlines():
            line = line.strip()
            if line.upper().startswith("PRIORITY:"):
                val = line.split(":", 1)[1].strip().lower()
                if val in ("low", "medium", "high", "urgent"):
                    result["priority"] = val
            elif line.upper().startswith("CATEGORY:"):
                result["category"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("IMPROVED_TITLE:"):
                result["improved_title"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("DESCRIPTION:"):
                result["description"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("SUBTASK:"):
                val = line.split(":", 1)[1].strip()
                if val:
                    result["subtasks"] = result["subtasks"] + [val]
            elif line.upper().startswith("SUMMARY:"):
                result["summary"] = line.split(":", 1)[1].strip()

        return result

    def chat(self, message: str, todos: list[Todo]) -> str:
        lines = []
        for t in todos:
            sub = ""
            if t.subtasks:
                done = sum(1 for s in t.subtasks if s.is_complete)
                sub = f" [{done}/{len(t.subtasks)} subtasks]"
            lines.append(
                f"- [{t.id}] [{t.priority}] {t.title} ({t.status}){sub}"
                + (f" @{t.category}" if t.category else "")
            )

        context = "\n".join(lines) if lines else "(no tasks yet)"
        prompt = (
            f"My current tasks:\n{context}\n\n"
            f"User message: {message}\n\n"
            f"Help me with whatever I'm asking. If I'm asking to add, change, "
            f"or organize tasks, describe what you'd recommend."
        )
        return self._ask(prompt)
