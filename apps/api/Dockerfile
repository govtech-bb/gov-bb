# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:24-alpine AS builder

# Corepack must run as root — it writes to /usr/local/bin.
RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# Create the app user up front so every COPY can use --chown=app:app.
# Explicit UID/GID so we can match them in the cache-mount uid=/gid= options
# below — without that match, the app user can't write to the cache mount.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./

# Per-workspace manifests are required for pnpm to resolve the workspace graph.
COPY --chown=app:app apps/api/package.json apps/api/
COPY --chown=app:app apps/landing/package.json apps/landing/
COPY --chown=app:app apps/forms/package.json apps/forms/
COPY --chown=app:app packages/database/package.json packages/database/
COPY --chown=app:app packages/expressions/package.json packages/expressions/
COPY --chown=app:app packages/form-conditions/package.json packages/form-conditions/
COPY --chown=app:app packages/form-types/package.json packages/form-types/
COPY --chown=app:app packages/form-validation/package.json packages/form-validation/
COPY --chown=app:app packages/registry/package.json packages/registry/

# BuildKit cache mount keeps the pnpm content-addressable store across builds,
# so a cache-invalidating change to the lockfile or any package.json re-installs
# without re-downloading from the registry. Shared `id` across all four app
# Dockerfiles so they hit the same store. uid/gid match the app user so it can
# write to the mount.
# NOTE: this install intentionally includes devDependencies. The runner stage
# copies the builder's node_modules wholesale, and the migrate-task's
# `pnpm migration:run` registers tsconfig-paths — a devDependency of apps/api —
# at runtime. Switching to --prod here would break in-container migrations
# with MODULE_NOT_FOUND on tsconfig-paths/register.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

# Source — copy only what's needed to build `api`. Recipes live under
# apps/api/src/forms/form-definitions/recipes/ and arrive with the apps/api/
# copy above.
COPY --chown=app:app apps/api/ apps/api/
COPY --chown=app:app packages/ packages/

RUN pnpm exec nx build api

# Assemble a self-contained production tree with pnpm's purpose-built
# command: app source + compiled dist + node_modules with workspace
# packages materialized (no cross-tree symlinks to hand-maintain).
# devDependencies are included on purpose — the ECS sandbox migrate-task
# runs `pnpm migration:run`, which needs ts-node/tsconfig-paths at runtime.
# --legacy: this workspace doesn't use injected workspace packages.
RUN pnpm --filter=@govtech-bb/api deploy --legacy /home/app/deployed

# ---- dev ----------------------------------------------------------------
# Hot-reload image used by docker-compose for local iteration. Reuses the
# builder stage (deps already installed, source already copied, prod build
# already primed) and swaps the CMD to `nx dev api` — the same watcher
# (@nx/js:node → tsc --watch + node restart) the host uses via
# `pnpm dev:api`. Compose bind-mounts apps/api/src and ./packages on top
# of the copied source, so host edits trigger a rebuild + restart inside
# the container. Kept BEFORE `runner` so `runner` stays the default
# last stage — prod builds (ECS, CI) don't need to pass --target.
FROM builder AS dev
ENV NODE_ENV=development
EXPOSE 3001
CMD ["pnpm", "exec", "nx", "dev", "api"]

# ---- runner -------------------------------------------------------------
# Slim runtime image built from `pnpm deploy`'s self-contained output: the
# api package (source + compiled dist/) with a materialized node_modules —
# workspace packages included as real directories, no cross-tree symlinks.
# Includes pnpm so the ECS sandbox migrate-task (deploy-sandbox.yml) can
# shell in and run `pnpm migration:run`.
FROM node:24-alpine AS runner

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

# apps/api/tsconfig.json extends ../../tsconfig.base.json. The migrate-task
# preloads tsconfig-paths/register, which follows that extends chain from
# /app — park the base config where the relative path lands. Its `paths`
# targets don't exist in this image, so tsconfig-paths falls back to normal
# node_modules resolution (the deployed packages' compiled dist).
COPY --from=builder --chown=app:app /app/tsconfig.base.json /tsconfig.base.json

WORKDIR /app

# Download AWS RDS CA bundle for TLS connections to RDS (must run before USER app)
RUN wget -O /app/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chown app:app /app/rds-ca-bundle.pem

RUN chown app:app /app
USER app

COPY --from=builder --chown=app:app /home/app/deployed/ ./

ENV NODE_ENV=production
# pnpm 11 verifies workspace dep status before running scripts — meaningless
# (and fatal) in a deployed, lockfile-less tree like this image.
ENV pnpm_config_verify_deps_before_run=false
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
