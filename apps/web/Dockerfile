# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js app (standalone output) in a pnpm monorepo.
# Build context is the repository root: `docker build -f apps/web/Dockerfile .`

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps: install with a frozen lockfile using only manifests ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/money/package.json packages/money/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/rpc/package.json packages/rpc/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ---- build: compile the Next.js app ----
FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
# A syntactically valid URL is enough for `next build` (no DB connection is made).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV BETTER_AUTH_SECRET="build-secret-build-secret-build-secret-1234"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN pnpm --filter @acc/web build

# ---- runner: minimal runtime image from the standalone output ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
# server.js honours PORT and HOSTNAME env vars.
CMD ["node", "apps/web/server.js"]
