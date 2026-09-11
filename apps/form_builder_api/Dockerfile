# syntax=docker/dockerfile:1.7
# Form Builder API — lightweight Express server for form CRUD + AI/Bedrock calls.
# Runs behind the existing ALB at /builder/*.

FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS builder

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY --chown=app:app patches/ ./patches/
COPY --chown=app:app apps/form_builder_api/package.json apps/form_builder_api/
COPY --chown=app:app packages/database/package.json packages/database/
COPY --chown=app:app packages/form-builder/package.json packages/form-builder/
COPY --chown=app:app packages/form-types/package.json packages/form-types/
COPY --chown=app:app packages/form-conditions/package.json packages/form-conditions/
COPY --chown=app:app packages/form-validation/package.json packages/form-validation/
COPY --chown=app:app packages/expressions/package.json packages/expressions/
COPY --chown=app:app packages/registry/package.json packages/registry/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

COPY --chown=app:app apps/form_builder_api/ apps/form_builder_api/
COPY --chown=app:app packages/ packages/

# Build the API and all workspace deps (Nx handles the dependency graph via dependsOn: ["^build"])
RUN pnpm exec nx build form-builder-api

# ---- prod-deps ---------------------------------------------------------------
# Runtime node_modules: only @govtech-bb/form-builder-api's graph (plus the root
# project, whose runtime deps it shares), no devDependencies. Linked from the
# cache-mount store where possible, fetched otherwise (a CACHED install layer
# leaves the mount empty). Mirrors apps/api/Dockerfile.
FROM builder AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    rm -rf node_modules apps/form_builder_api/node_modules packages/*/node_modules && \
    pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts --prefer-offline --prod \
      --filter @govtech-bb/form-builder-api... --filter @govtech-bb/modular-forms-monorepo

# ---- runner ----------------------------------------------------------------
# Matches the main API's runner pattern exactly.
FROM node:24.20-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS runner

# Pick up Alpine security patches ahead of the base image's rebuild cadence
# (e.g. openssl 3.5.8-r0 fixing CVE-2026-75803/CVE-2026-63073 while the base
# still ships 3.5.7).
RUN apk upgrade --no-cache

# npm and corepack are dead weight AWS Inspector still scans (npm's vendored
# tar/pacote/undici/ip-address/brace-expansion copies were all flagged);
# nothing in this image runs either — the entrypoint is plain node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack
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

# Compiled API output
COPY --from=builder --chown=app:app /app/apps/form_builder_api/dist/ ./dist/

# Compiled workspace packages (built by nx via dependsOn — emitted to dist/packages/{name}/src/*.js).
# Matches main API pattern: each workspace package's package.json declares main: "./src/index.js",
# so dist/packages/{name}/src/index.js lands at packages/{name}/src/index.js to resolve correctly.
COPY --from=builder --chown=app:app /app/dist/packages/ ./packages/

# Production-only node_modules (see prod-deps above).
COPY --from=prod-deps --chown=app:app /app/node_modules/ ./node_modules/
# pnpm hoists conflicting versions to the root; preserve this API's own resolutions.
COPY --from=prod-deps --chown=app:app /app/apps/form_builder_api/node_modules/ ./node_modules/

# Workspace package symlinks so require("@govtech-bb/database") resolves.
# Generated from whatever's actually in packages/ rather than a hand-maintained
# list — the previous hard-coded list silently broke when `@govtech-bb/git-publish`
# was added (#1400) without updating it: the container crash-looped on
# MODULE_NOT_FOUND and ECS's circuit breaker rolled back, masking the failure as
# a "successful" deploy. (Mirrors apps/api/Dockerfile.)
RUN mkdir -p node_modules/@govtech-bb && \
    for pkg_dir in packages/*/; do \
      pkg_name=$(basename "$pkg_dir"); \
      [ -f "$pkg_dir/package.json" ] || continue; \
      ln -sfn "../../packages/$pkg_name" "node_modules/@govtech-bb/$pkg_name"; \
      echo "  symlinked @govtech-bb/$pkg_name"; \
    done

# Package manifests needed for module resolution
COPY --from=builder --chown=app:app /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=app:app /app/packages/form-builder/package.json ./packages/form-builder/
COPY --from=builder --chown=app:app /app/packages/form-types/package.json ./packages/form-types/
COPY --from=builder --chown=app:app /app/packages/form-conditions/package.json ./packages/form-conditions/
COPY --from=builder --chown=app:app /app/packages/form-validation/package.json ./packages/form-validation/
COPY --from=builder --chown=app:app /app/packages/expressions/package.json ./packages/expressions/
COPY --from=builder --chown=app:app /app/packages/registry/package.json ./packages/registry/
COPY --from=builder --chown=app:app /app/packages/git-publish/package.json ./packages/git-publish/

# Root package.json + tsconfig for path resolution
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/tsconfig.base.json ./
COPY --from=builder --chown=app:app /app/apps/form_builder_api/package.json ./apps/form_builder_api/
COPY --from=builder --chown=app:app /app/apps/form_builder_api/tsconfig.json ./apps/form_builder_api/

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
ENV PORT=3003
EXPOSE 3003

CMD ["node", "--require", "reflect-metadata", "dist/main.js"]
