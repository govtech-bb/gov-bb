# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles api_v2 into apps/api_v2/dist, using the full monorepo as context:
#   docker build -f apps/api_v2/Dockerfile .
# Same shape as apps/api/Dockerfile; the comments there explain the pnpm
# cache mount and the hoisted prod-deps install in more detail.
FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS builder

# Corepack must run as root — it writes to /usr/local/bin.
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# Explicit UID/GID so the cache-mount uid=/gid= options below match the user.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY --chown=app:app patches/ ./patches/

# Per-workspace manifests pnpm needs to resolve the graph for api_v2.
# content is only a devDependency (scripts/build-seed-data.ts); the runtime
# reads the committed src/seed-data/estate.json instead. The root
# package.json also pins it (workspace:*).
COPY --chown=app:app apps/api_v2/package.json apps/api_v2/
COPY --chown=app:app packages/content/package.json packages/content/

# Full install, devDependencies included: nx and TypeScript are root devDeps.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts \
      --filter @govtech-bb/api-v2... --filter @govtech-bb/modular-forms-monorepo

COPY --chown=app:app apps/api_v2/ apps/api_v2/

# --excludeTaskDependencies: api_v2 imports no workspace package at runtime,
# so there is nothing upstream to build.
RUN pnpm exec nx build api_v2 --excludeTaskDependencies

# ---- prod-deps ----------------------------------------------------------
# Production dependencies in pnpm's default isolated layout: the packages
# live in /app/node_modules/.pnpm and apps/api_v2/node_modules links to them,
# the same layout the e2e suite boots `node dist/src/main.js` against.
#
# Not the hoisted layout apps/api uses: for api_v2 it came to 1.3GB. This is
# ~400MB, still more than api_v2 needs, for two reasons that the filter can't
# remove (`pnpm why`): the root project's prod deps (NestJS and friends) are
# always installed, and the lockfile resolves better-auth's optional peers
# (TanStack Start, React, vitest) against the workspace.
FROM builder AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    rm -rf node_modules apps/api_v2/node_modules packages/*/node_modules && \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts --prefer-offline --prod \
      --filter @govtech-bb/api-v2

# ---- runner -------------------------------------------------------------
# Slim runtime image: plain `node`, no package manager. Migrations and the
# seed run inside the app at boot (src/main.ts), so there is no separate
# migrate step.
FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS runner

# Alpine security patches ahead of the base image's rebuild cadence.
RUN apk upgrade --no-cache

# npm, corepack and node's OpenSSL headers are unused here and flagged by
# AWS Inspector (see apps/api/Dockerfile).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /usr/local/include/node

# No container should run as root (CIS Docker Benchmark, #15).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# `script` is required for ECS Exec session logging (#217); the api-v2 service
# has enable_execute_command on.
RUN apk add --no-cache util-linux-misc

RUN chown app:app /app
USER app

# Keep the monorepo paths so apps/api_v2/node_modules' relative links still
# reach /app/node_modules/.pnpm. No RDS CA bundle baked in: the task
# definition passes the PEM in DB_SSL_CA, which src/db.ts hands to pg.
COPY --from=prod-deps --chown=app:app /app/node_modules/ ./node_modules/
COPY --from=prod-deps --chown=app:app /app/apps/api_v2/node_modules/ ./apps/api_v2/node_modules/
COPY --from=builder --chown=app:app /app/apps/api_v2/dist/ ./apps/api_v2/dist/
# The compiled output is CommonJS; api_v2's package.json (no "type") keeps it so.
COPY --from=builder --chown=app:app /app/apps/api_v2/package.json ./apps/api_v2/

WORKDIR /app/apps/api_v2
ENV NODE_ENV=production
EXPOSE 3020

CMD ["node", "dist/src/main.js"]
