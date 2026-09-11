# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS builder

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
COPY --chown=app:app patches/ ./patches/

# Per-workspace manifests are required for pnpm to resolve the workspace graph.
COPY --chown=app:app apps/api/package.json apps/api/
COPY --chown=app:app packages/database/package.json packages/database/
COPY --chown=app:app packages/expressions/package.json packages/expressions/
COPY --chown=app:app packages/form-conditions/package.json packages/form-conditions/
COPY --chown=app:app packages/form-types/package.json packages/form-types/
COPY --chown=app:app packages/form-validation/package.json packages/form-validation/
COPY --chown=app:app packages/registry/package.json packages/registry/
# content is never imported by the api, but the ROOT package.json pins it
# (workspace:*), and the root project is part of the prod-deps install below.
COPY --chown=app:app packages/content/package.json packages/content/

# BuildKit cache mount keeps the pnpm content-addressable store across builds,
# so a cache-invalidating change to the lockfile or any package.json re-installs
# without re-downloading from the registry. Shared `id` across all app
# Dockerfiles so they hit the same store. uid/gid match the app user so it can
# write to the mount. Full install, devDependencies included: nx and the
# TypeScript toolchain are root devDeps, and the `dev` stage needs them too.
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

# ---- prod-deps ----------------------------------------------------------
# node_modules for the runner: only what @govtech-bb/api needs at runtime
# (plus the root project, whose runtime deps it shares) — no devDependencies,
# nothing from the other apps or from packages the api never imports. The
# builder's full install is ~900MB of nx/vitest/vite/react/playwright that
# AWS Inspector scans and every task start pulls. Re-linked offline from the
# cache-mount store the install above populated.
FROM builder AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    rm -rf node_modules apps/api/node_modules packages/*/node_modules && \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts --offline --prod \
      --filter @govtech-bb/api... --filter @govtech-bb/modular-forms-monorepo

# ---- runner -------------------------------------------------------------
# Slim runtime image: plain `node`, no package manager. The ECS migrate task
# (deploy-*.yml) runs the compiled data source directly —
#   node node_modules/typeorm/cli.js migration:run -d dist/src/database/data-source.js
# — so nothing here needs pnpm, corepack or ts-node.
FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS runner

# Pick up Alpine security patches ahead of the base image's rebuild cadence
# (e.g. openssl 3.5.8-r0 fixing CVE-2026-75803/CVE-2026-63073 while the base
# still ships 3.5.7).
RUN apk upgrade --no-cache

# npm and corepack are dead weight AWS Inspector still scans (npm's vendored
# tar/pacote/undici/ip-address/brace-expansion copies were all flagged);
# nothing in this image runs either.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack

# Closes #15 (CIS Docker Benchmark — no container should run as root).
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# `script` is required for ECS Exec session logging (issue #217). ECS Exec
# uploads the session to CloudWatch/S3 only if `script` and `cat` are present in
# the image; node:alpine ships busybox `cat` but NOT `script` (it lives in
# util-linux-misc). Without it, exec works but nothing is ever logged.
RUN apk add --no-cache util-linux-misc

# AWS RDS CA bundle for TLS connections to RDS (issue #304). Committed to the
# repo (certs/rds-global-bundle.pem) and COPYed in rather than fetched at build
# time — no unverified network download, and the build no longer depends on the
# truststore endpoint being reachable. It's the global-bundle.pem of RDS root
# CAs; RDS auto-rotates the DB *server* cert under the same roots, so this is
# stable for years. Refresh only on a new RDS root-CA generation (rare):
#   curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o certs/rds-global-bundle.pem
COPY --chown=app:app certs/rds-global-bundle.pem /app/rds-ca-bundle.pem

RUN chown app:app /app
USER app

COPY --from=builder --chown=app:app /app/dist/apps/api/ ./dist/
COPY --from=builder --chown=app:app /app/dist/packages/ ./packages/
COPY --from=prod-deps --chown=app:app /app/node_modules/ ./node_modules/

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

# The in-app `@/*` alias (tsconfig: "@/*" -> "./src/*") is left as a literal
# `require("@/...")` in the compiled output — the runtime CMD is plain
# `node dist/src/main.js` with no path resolver. Expose dist/src under the `@`
# scope so those requires resolve (e.g. `@/database/base.repository` ->
# dist/src/database/base.repository.js), the same symlink approach used for the
# workspace packages above. Without it the container crash-loops on
# MODULE_NOT_FOUND and ECS's circuit breaker silently rolls back (#1385).
RUN ln -sfn ../dist/src node_modules/@
COPY --from=builder --chown=app:app /app/package.json ./
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
