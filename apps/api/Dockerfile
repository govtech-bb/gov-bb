# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:20-alpine AS builder

# Corepack must run as root — it writes to /usr/local/bin.
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

# Create the app user up front so every COPY can use --chown=app:app.
# Explicit UID/GID so we can match them in the cache-mount uid=/gid= options
# below — without that match, the app user can't write to the cache mount.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./

# Per-workspace manifests are required for pnpm to resolve the workspace graph.
COPY --chown=app:app apps/api/package.json apps/api/
COPY --chown=app:app apps/landing/package.json apps/landing/
COPY --chown=app:app apps/forms/package.json apps/forms/
COPY --chown=app:app packages/expressions/package.json packages/expressions/
COPY --chown=app:app packages/form-conditions/package.json packages/form-conditions/
COPY --chown=app:app packages/form-types/package.json packages/form-types/
COPY --chown=app:app packages/form-validation/package.json packages/form-validation/

# BuildKit cache mount keeps the pnpm content-addressable store across builds,
# so a cache-invalidating change to the lockfile or any package.json re-installs
# without re-downloading from the registry. Shared `id` across all four app
# Dockerfiles so they hit the same store. uid/gid match the app user so it can
# write to the mount.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

# Source — copy only what's needed to build `api`.
COPY --chown=app:app apps/api/ apps/api/
COPY --chown=app:app packages/ packages/

RUN pnpm exec nx build api

# ---- runner -------------------------------------------------------------
# Slim runtime image. Includes pnpm so the ECS sandbox migrate-task
# (deploy-sandbox.yml) can shell into the container and run `pnpm migration:run`.
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --from=builder --chown=app:app /app/dist/apps/api/ ./dist/
COPY --from=builder --chown=app:app /app/dist/packages/ ./packages/
COPY --from=builder --chown=app:app /app/packages/form-types/src/ ./packages/form-types/src/
COPY --from=builder --chown=app:app /app/node_modules/ ./node_modules/

# pnpm (hoisted mode) keeps workspace-package symlinks in the consumer's
# own node_modules (apps/api/node_modules/@govtech-bb/*). The runtime
# entry is /app/dist/src/main.js, and Node's module-lookup walks up from
# there — it never enters apps/api/. Expose the workspace packages at the
# root so `require("@govtech-bb/form-types")` resolves.
RUN mkdir -p node_modules/@govtech-bb && \
    ln -sfn ../../packages/expressions node_modules/@govtech-bb/expressions && \
    ln -sfn ../../packages/form-conditions node_modules/@govtech-bb/form-conditions && \
    ln -sfn ../../packages/form-types node_modules/@govtech-bb/form-types && \
    ln -sfn ../../packages/form-validation node_modules/@govtech-bb/form-validation
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/pnpm-lock.yaml ./
COPY --from=builder --chown=app:app /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=app:app /app/.npmrc ./
COPY --from=builder --chown=app:app /app/tsconfig.base.json ./
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/typeorm.config.ts ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/src/database/ ./apps/api/src/database/
# Email templates (.hbs files not copied by tsc build)
COPY --from=builder --chown=app:app /app/apps/api/src/email/templates/ ./dist/src/email/templates/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
