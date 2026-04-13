# ── Stage 1: dependency installation ─────────────────────────────────────────
FROM python:3.12-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.4.30 /uv /usr/local/bin/uv

WORKDIR /app

# Copy dependency manifest first so this layer is cached unless pyproject.toml changes
COPY pyproject.toml .

# If a lockfile exists (committed to repo), use it for reproducible installs.
# If not (first build), uv will resolve and create one.
# --no-install-project: skip installing the project itself (just deps)
# --no-dev: skip dev dependencies
COPY uv.lock* ./
RUN uv sync --no-install-project --no-dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runner

# curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy venv from builder stage (node_modules equivalent)
COPY --from=builder /app/.venv /app/.venv

# Copy application source
COPY src/ ./src/
COPY pyproject.toml .
COPY langgraph.json .

# Create data dirs (populated via volume mounts in docker-compose)
RUN mkdir -p /app/data/memory /app/data/kuzu /app/workspace

# Activate venv — all python/uvicorn commands will use it
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
