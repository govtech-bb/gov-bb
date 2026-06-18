# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS builder

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
FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS runner

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# Download AWS RDS CA bundle for TLS connections to RDS (must run before USER app)
RUN wget -O /app/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chown app:app /app/rds-ca-bundle.pem

RUN chown app:app /app
USER app

COPY --from=builder --chown=app:app /app/dist/apps/api/ ./dist/
COPY --from=builder --chown=app:app /app/dist/packages/ ./packages/
# Workspace-package SOURCE overlays for ts-node. The migrate-task runs
# `pnpm migration:run`, which ts-node-compiles apps/api/typeorm.config.ts →
# data-source.ts and typechecks every `@govtech-bb/*` import against the
# tsconfig.base.json `paths` mapping — `packages/<pkg>/src/index.ts`. The
# compiled packages copied above contain only .js/.d.ts, and a missing paths
# target makes TypeScript crash with a bare "Debug Failure" (it asserts while
# building the module-not-found diagnostic). Any package imported from the
# ts-node-compiled graph needs its src/ overlaid here; runtime require()
# still resolves to the compiled .js via the package.json `main`.
#   - form-types: imported (type-only) by the entity declarations
#   - database: imported by data-source.ts since #721
COPY --from=builder --chown=app:app /app/packages/form-types/src/ ./packages/form-types/src/
COPY --from=builder --chown=app:app /app/packages/database/src/ ./packages/database/src/
COPY --from=builder --chown=app:app /app/node_modules/ ./node_modules/

# pnpm (hoisted mode) keeps workspace-package symlinks in the consumer's
# own node_modules (apps/api/node_modules/@govtech-bb/*). The runtime
# entry is /app/dist/src/main.js, and Node's module-lookup walks up from
# there — it never enters apps/api/. Expose the workspace packages at the
# root so `require("@govtech-bb/form-types")` resolves.
#
# Symlinks are generated from whatever's actually in packages/ rather than
# from a hand-maintained list. The previous hard-coded list silently broke
# (#412) when `registry` was added without updating the Dockerfile — the
# API crash-looped on MODULE_NOT_FOUND and ECS's circuit breaker rolled
# back to the prior image, masking the failure as a "successful" deploy.
RUN mkdir -p node_modules/@govtech-bb && \
    for pkg_dir in packages/*/; do \
      pkg_name=$(basename "$pkg_dir"); \
      [ -f "$pkg_dir/package.json" ] || continue; \
      ln -sfn "../../packages/$pkg_name" "node_modules/@govtech-bb/$pkg_name"; \
      echo "  symlinked @govtech-bb/$pkg_name"; \
    done
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/pnpm-lock.yaml ./
COPY --from=builder --chown=app:app /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=app:app /app/tsconfig.base.json ./
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/typeorm.config.ts ./apps/api/
COPY --from=builder --chown=app:app /app/apps/api/src/database/ ./apps/api/src/database/
# Recipe files (.json) — read by RecipeFileLoaderService. tsc/nx don't bundle
# non-`.ts` assets into dist/, so we copy them alongside the compiled output
# (mirrors the email-templates COPY below).
COPY --from=builder --chown=app:app /app/apps/api/src/forms/form-definitions/recipes/ ./dist/src/forms/form-definitions/recipes/
# Email templates (.hbs files not copied by tsc build)
COPY --from=builder --chown=app:app /app/apps/api/src/email/templates/ ./dist/src/email/templates/

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
