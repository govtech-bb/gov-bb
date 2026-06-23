# syntax=docker/dockerfile:1.7
# TanStack Start chat app (Vite dev server inside the container for local-stack
# parity, matching apps/landing and apps/forms). Production hosting is separate
# — there's no production-build validation here (that lives in CI).

FROM node:24-alpine3.23

# Corepack must run as root — it writes to /usr/local/bin.
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# Create the app user up front so every COPY can use --chown=app:app.
# Explicit UID/GID so we can match them in the cache-mount uid=/gid= options
# below — without that match, the app user can't write to the cache mount.
# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY --chown=app:app apps/api/package.json apps/api/
COPY --chown=app:app apps/landing/package.json apps/landing/
COPY --chown=app:app apps/forms/package.json apps/forms/
COPY --chown=app:app apps/chat/package.json apps/chat/
COPY --chown=app:app packages/aws-secrets/package.json packages/aws-secrets/
COPY --chown=app:app packages/content/package.json packages/content/
COPY --chown=app:app packages/expressions/package.json packages/expressions/
COPY --chown=app:app packages/form-conditions/package.json packages/form-conditions/
COPY --chown=app:app packages/form-types/package.json packages/form-types/
COPY --chown=app:app packages/form-validation/package.json packages/form-validation/

# BuildKit cache mount keeps the pnpm content-addressable store across builds.
# Shared `id` across all four app Dockerfiles so they hit the same store.
# uid/gid match the app user so it can write to the mount.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

# chat depends on @govtech-bb/content (workspace) at ingest time.
COPY --chown=app:app apps/chat/ apps/chat/
# aws-secrets is a source-only ESM package (exports "./src/index.ts", no build),
# imported by src/lib/db/index.ts. The boot CMD runs `tsx src/lib/db/migrate.ts`
# which loads it from source, so the source tree must be present or the
# container crash-loops on ERR_MODULE_NOT_FOUND (#1392 added the import).
COPY --chown=app:app packages/aws-secrets/ packages/aws-secrets/
COPY --chown=app:app packages/content/ packages/content/

ENV NODE_ENV=development
EXPOSE 3000

WORKDIR /app/apps/chat
# Apply pending migrations on boot (idempotent), then start vite dev. Mirrors
# the api's "migrate on bootstrap" pattern so a fresh `docker compose up` lands
# in a runnable state without manual steps.
CMD ["sh", "-c", "pnpm exec tsx src/lib/db/migrate.ts && pnpm exec vite dev --host 0.0.0.0 --port 3000 --clearScreen false"]
