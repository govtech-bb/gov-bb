# syntax=docker/dockerfile:1.7
# Form Builder API — lightweight Express server for form CRUD + AI/Bedrock calls.
# Runs behind the existing ALB at /builder/*.

FROM node:24-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS builder

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY --chown=app:app apps/form_builder_api/package.json apps/form_builder_api/
COPY --chown=app:app packages/ai-bedrock/package.json packages/ai-bedrock/
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

# ---- runner ----------------------------------------------------------------
# Matches the main API's runner pattern exactly.
FROM node:24-alpine3.23@sha256:595398b0081eacda8e1c4c5b97b76cd1020e4d58a8ebcb4843b9bca1e79e7436 AS runner

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate
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

# node_modules from builder (has all deps resolved)
COPY --from=builder --chown=app:app /app/node_modules/ ./node_modules/

# Drop esbuild from the runtime image (#1567). esbuild ships a Go-compiled
# binary (@esbuild/<platform>/bin/esbuild) that AWS Inspector flags as
# go/stdlib CVE-2025-68121 (+ other go/stdlib CVEs). It's a build-time tool
# only — the runner runs `node dist/main.js` and never loads esbuild — so
# removing it closes the finding with no runtime impact.
RUN rm -rf node_modules/@esbuild node_modules/esbuild

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
COPY --from=builder --chown=app:app /app/packages/ai-bedrock/package.json ./packages/ai-bedrock/
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
