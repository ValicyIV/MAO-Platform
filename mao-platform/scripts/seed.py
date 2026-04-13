#!/usr/bin/env python3
"""
seed.py — Seed the local development environment.

Creates initial data to make the platform immediately usable:
  1. Verifies the API is reachable
  2. Runs a test workflow so the graph UI has something to show
  3. Optionally inserts example memory graph entries into Kuzu

Usage:
    python scripts/seed.py [--skip-workflow] [--api-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.request
import urllib.error


def check_api(api_url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{api_url}/api/health", timeout=5) as resp:
            data = json.loads(resp.read())
            return data.get("status") == "ok"
    except Exception as e:
        print(f"  API not reachable: {e}")
        return False


def create_workflow(api_url: str, task: str) -> str | None:
    try:
        payload = json.dumps({"task": task}).encode()
        req = urllib.request.Request(
            f"{api_url}/api/workflows",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("workflow_id")
    except Exception as e:
        print(f"  Failed to create workflow: {e}")
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed MAO Platform dev environment")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--skip-workflow", action="store_true")
    args = parser.parse_args()

    print("╔══════════════════════════════════════╗")
    print("║     MAO Platform — Seed Script       ║")
    print("╚══════════════════════════════════════╝")
    print()

    # 1. Check API
    print("→ Checking API health...")
    for attempt in range(10):
        if check_api(args.api_url):
            print("  ✓ API is ready")
            break
        print(f"  Waiting... ({attempt + 1}/10)")
        time.sleep(2)
    else:
        print("  ✗ API did not become ready in time")
        return 1

    # 2. Run example workflow
    if not args.skip_workflow:
        print()
        print("→ Creating example workflow...")
        task = (
            "Briefly research the concept of multi-agent orchestration "
            "and summarise the key patterns in 2-3 bullet points."
        )
        wf_id = create_workflow(args.api_url, task)
        if wf_id:
            print(f"  ✓ Workflow created: {wf_id}")
            print(f"  Open ws://localhost:8000/ws/{wf_id} to watch events")
        else:
            print("  ✗ Workflow creation failed (check API logs)")

    # 3. Summary
    print()
    print("✓ Seed complete. Open http://localhost:5173 to get started.")
    print()
    print("  Useful URLs:")
    print(f"    Frontend:  http://localhost:5173")
    print(f"    API docs:  {args.api_url}/api/docs")
    print(f"    Langfuse:  http://localhost:3001")

    return 0


if __name__ == "__main__":
    sys.exit(main())
