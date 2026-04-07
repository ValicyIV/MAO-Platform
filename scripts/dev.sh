#!/usr/bin/env bash
# dev.sh — Start the MAO Platform in development mode.
# Runs the FastAPI backend and Vite frontend concurrently.
# Requires: Python 3.12+, uv, Node 20+, pnpm, tmux (optional).

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"

echo "╔══════════════════════════════════════╗"
echo "║     MAO Platform — Dev Mode          ║"
echo "╚══════════════════════════════════════╝"

# ── Check .env ────────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  echo "⚠  No .env found — copying .env.example"
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "   Fill in ANTHROPIC_API_KEY and other values in .env"
fi

# ── Start supporting services via Docker Compose ──────────────────────────────
echo ""
echo "→ Starting Postgres, Redis, and Langfuse via Docker..."
docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis langfuse
echo "  Waiting for Postgres..."
until docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U mao 2>/dev/null; do
  sleep 1
done
echo "  ✓ Postgres ready"

# ── Backend ───────────────────────────────────────────────────────────────────
start_api() {
  echo ""
  echo "→ Starting FastAPI backend (port 8000)..."
  cd "$API_DIR"
  if command -v uv &>/dev/null; then
    uv sync --dev
    uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
  else
    echo "  uv not found — install from https://github.com/astral-sh/uv"
    exit 1
  fi
}

# ── Frontend ──────────────────────────────────────────────────────────────────
start_web() {
  echo ""
  echo "→ Starting Vite frontend (port 5173)..."
  cd "$ROOT"
  pnpm install
  cd "$WEB_DIR"
  pnpm dev
}

# ── Run both concurrently ─────────────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  # Use tmux for split-pane view if available
  SESSION="mao-dev"
  tmux new-session -d -s "$SESSION" -x 220 -y 50
  tmux send-keys -t "$SESSION" "$(declare -f start_api); start_api" Enter
  tmux split-window -h -t "$SESSION"
  tmux send-keys -t "$SESSION" "$(declare -f start_web); start_web" Enter
  echo ""
  echo "✓ Running in tmux session '$SESSION'"
  echo "  Attach with: tmux attach -t $SESSION"
  echo ""
  echo "  Services:"
  echo "    API      → http://localhost:8000"
  echo "    Frontend → http://localhost:5173"
  echo "    Langfuse → http://localhost:3001"
  echo "    API docs → http://localhost:8000/api/docs"
  tmux attach -t "$SESSION"
else
  # Fallback: run API in background, web in foreground
  echo ""
  echo "ℹ  tmux not found — running API in background"
  start_api &
  API_PID=$!
  trap "kill $API_PID 2>/dev/null" EXIT
  sleep 2
  start_web
fi
