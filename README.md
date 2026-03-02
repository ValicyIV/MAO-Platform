# AI Todo Assistant

An AI-powered command-line todo list assistant that helps you organize, prioritize, and complete tasks. Uses Claude as the AI backend to provide intelligent task breakdowns, priority suggestions, and daily planning.

## Features

- **Task management** — add, edit, complete, remove, and search tasks
- **Subtasks** — break tasks into smaller pieces, manually or with AI help
- **AI task breakdown** — ask Claude to decompose a task into actionable subtasks
- **AI priority suggestions** — get an objective take on what matters most
- **AI next-step advice** — when you're stuck, ask for the next concrete action
- **AI categorization** — automatically group tasks into categories
- **Daily summary** — get a focus plan for the day based on your current tasks
- **Free-form chat** — ask the AI anything about your task list
- **Persistent storage** — tasks are saved to `~/.todo_assistant/todos.json`

## Installation

```bash
pip install -e .
```

## Setup

Export your Anthropic API key:

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

## Usage

Start the assistant:

```bash
todo
```

### Commands

| Command | Description |
|---|---|
| `add` | Add a new task interactively |
| `list` | Show all tasks (filter: `list todo`, `list high`, `list work`) |
| `view ID` | View full task details |
| `edit ID` | Edit a task's title and description |
| `done ID` | Mark a task as complete |
| `start ID` | Mark a task as in-progress |
| `remove ID` | Delete a task |
| `subtask ID` | Add a subtask to a task |
| `search QUERY` | Search tasks by keyword |
| `clear-done` | Remove all completed tasks |

### AI Commands

| Command | Description |
|---|---|
| `breakdown ID` | Ask AI to break a task into subtasks |
| `priority ID` | Ask AI to suggest a priority level |
| `nextstep ID` | Ask AI for the next concrete action |
| `category ID` | Ask AI to suggest a category |
| `summary` | Get a daily focus plan |
| `chat MESSAGE` | Free-form conversation about your tasks |

## Development

```bash
pip install -e ".[dev]"
pytest
```
