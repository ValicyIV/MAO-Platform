# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable pnpm

WORKDIR /workspace

# Copy workspace manifests first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/config/tsconfig.base.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/shared-types/src/ ./packages/shared-types/src/
COPY apps/web/package.json ./apps/web/

# Install all workspace deps
RUN pnpm install --frozen-lockfile

# Copy web source
COPY apps/web/ ./apps/web/

# Build
RUN pnpm --filter @mao/web exec vite build

# ── Stage 2: serve ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Copy built assets
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

# nginx config — SPA fallback + API proxy headers
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

RUN apk add --no-cache curl

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD curl -sf http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
