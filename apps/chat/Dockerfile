# syntax=docker/dockerfile:1.7
# TanStack Start chat app (Vite dev server inside the container for local-stack
# parity, matching apps/landing and apps/forms). Production hosting is separate.
#
# The build step runs the same `nx build chat` a deploy would, so this image
# also validates the production build with the current dependency tree.

FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
COPY apps/forms/package.json apps/forms/
COPY apps/chat/package.json apps/chat/
COPY packages/content/package.json packages/content/
COPY packages/expressions/package.json packages/expressions/
COPY packages/form-conditions/package.json packages/form-conditions/
COPY packages/form-types/package.json packages/form-types/
COPY packages/form-validation/package.json packages/form-validation/

RUN pnpm install --frozen-lockfile --ignore-scripts

# chat depends on @govtech-bb/content (workspace) at build/ingest time.
COPY apps/chat/ apps/chat/
COPY packages/content/ packages/content/

# chat has no project.json, so nx infers the project name from package.json
# (@govtech-bb/chat). Go via pnpm filter to dodge that mismatch entirely.
RUN pnpm --filter @govtech-bb/chat build

# ---- runner -------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/nx.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/apps/chat/ ./apps/chat/
COPY --from=builder /app/packages/content/ ./packages/content/

# Drop root. Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=development
EXPOSE 3000

WORKDIR /app/apps/chat
# Apply pending migrations on boot (idempotent), then start vite dev. Mirrors
# the api's "migrate on bootstrap" pattern so a fresh `docker compose up` lands
# in a runnable state without manual steps.
CMD ["sh", "-c", "pnpm exec tsx src/lib/db/migrate.ts && pnpm exec vite dev --host 0.0.0.0 --port 3000"]
