#!/usr/bin/env bash
# generate-types.sh — Generate TypeScript API types from FastAPI OpenAPI spec.
# Requires: running API at localhost:8000, openapi-typescript (pnpm dlx).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/packages/shared-types/src/api-types.ts"

echo "→ Fetching OpenAPI spec from http://localhost:8000/api/openapi.json..."
curl -sf http://localhost:8000/api/openapi.json -o /tmp/mao-openapi.json

echo "→ Generating TypeScript types..."
pnpm dlx openapi-typescript /tmp/mao-openapi.json \
  --output "$OUT" \
  --alphabetize \
  --path-params-as-types

echo "✓ Types written to $OUT"
