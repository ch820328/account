# syntax=docker/dockerfile:1
# Worker image: runs cron jobs (FX/prices/recurring/backup) and DB migrations.
# Also used as the one-off migrate/seed runner. Build context is the repo root:
#   docker build -f apps/worker/Dockerfile .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
# pg_dump for the nightly backup job.
RUN apk add --no-cache postgresql17-client

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/money/package.json packages/money/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/rpc/package.json packages/rpc/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS runtime
ENV NODE_ENV=production
COPY . .
# Default: run the worker. The migrate service overrides this command.
CMD ["pnpm", "--filter", "@acc/worker", "start"]
