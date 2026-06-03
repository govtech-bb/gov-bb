# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:20-alpine AS builder

# Corepack must run as root — it writes to /usr/local/bin.
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate

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
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

# Source — copy only what's needed to build `api`. Recipes live under
# apps/api/src/forms/form-definitions/recipes/ and arrive with the apps/api/
# copy above.
COPY --chown=app:app apps/api/ apps/api/
COPY --chown=app:app packages/ packages/

RUN pnpm exec nx build api

# `pnpm deploy` produces a self-contained copy of the api project at
# /app/deploy: project files plus a node_modules holding the full resolved
# dependency graph, with workspace packages (@govtech-bb/*) physically
# copied in. This replaces the old COPY-node_modules + symlink-loop runner
# assembly, which only worked under the hoisted linker (ADR 0002/0003).
# Dev deps are included on purpose — the ECS migrate-task runs
# `pnpm migration:run` (typeorm-ts-node-commonjs), which needs ts-node and
# typescript at runtime.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm --filter=@govtech-bb/api deploy --legacy --ignore-scripts /app/deploy

# Workspace packages declare `main: ./src/index.js`, but their src/ holds
# .ts source — compiled output lands in /app/dist/packages/<name>/src by
# nx. Overlay the compiled JS into every deployed physical copy under
# .pnpm (transitive workspace deps don't appear at the top level of an
# isolated node_modules, so we can't go through node_modules/@govtech-bb).
RUN for d in /app/dist/packages/*/; do \
      name=$(basename "$d"); \
      found=""; \
      for dest in /app/deploy/node_modules/.pnpm/@govtech-bb+"$name"@*/node_modules/@govtech-bb/"$name"; do \
        [ -d "$dest/src" ] || continue; \
        cp -RL "$d/src/." "$dest/src/"; \
        found=1; \
        echo "  overlaid compiled @govtech-bb/$name -> $dest"; \
      done; \
      [ -n "$found" ] || echo "  (no deployed copy of @govtech-bb/$name — not in api's graph)"; \
    done

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
# Slim runtime image. Includes pnpm so the ECS sandbox migrate-task
# (deploy-sandbox.yml) can shell into the container and run `pnpm migration:run`.
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.30.0 --activate

# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# Download AWS RDS CA bundle for TLS connections to RDS (must run before USER app)
RUN wget -O /app/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chown app:app /app/rds-ca-bundle.pem

RUN chown app:app /app
USER app

# The deploy output is the whole runtime: api project files (src/,
# typeorm.config.ts, package.json with the migration:* scripts) plus a
# self-contained node_modules. Layout mirrors the monorepo (apps/api under
# /app) so apps/api/tsconfig.json's `extends: ../../tsconfig.base.json`
# still resolves for the ts-node-driven migrate-task.
COPY --from=builder --chown=app:app /app/tsconfig.base.json ./
COPY --from=builder --chown=app:app /app/deploy/ ./apps/api/
COPY --from=builder --chown=app:app /app/dist/apps/api/ ./apps/api/dist/
# Recipe files (.json) — read by RecipeFileLoaderService. tsc/nx don't bundle
# non-`.ts` assets into dist/, so we copy them alongside the compiled output
# (mirrors the email-templates COPY below).
COPY --from=builder --chown=app:app /app/apps/api/src/forms/form-definitions/recipes/ ./apps/api/dist/src/forms/form-definitions/recipes/
# Email templates (.hbs files not copied by tsc build)
COPY --from=builder --chown=app:app /app/apps/api/src/email/templates/ ./apps/api/dist/src/email/templates/

# Workdir is the api project itself: `node dist/src/main.js` resolves
# modules by walking up into ./node_modules, and the ECS migrate-task's
# `pnpm migration:run` override hits apps/api's own script (cwd-relative
# typeorm.config.ts).
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
