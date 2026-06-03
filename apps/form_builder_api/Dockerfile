# syntax=docker/dockerfile:1.7
# Form Builder API — lightweight Express server for form CRUD + AI/Bedrock calls.
# Runs behind the existing ALB at /builder/*.

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
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

# Self-contained prod runtime via `pnpm deploy` — replaces the old
# COPY-node_modules + hand-maintained symlink list, which only worked under
# the hoisted linker (ADR 0002/0003) and silently broke when a workspace
# package was added (#412 failure class).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,uid=1001,gid=1001 \
    pnpm --filter=@govtech-bb/form-builder-api deploy --legacy --prod --ignore-scripts /app/deploy

# Workspace packages declare `main: ./src/index.js` but ship .ts source;
# nx emits compiled JS to /app/dist/packages/<name>/src. Overlay it into
# every deployed physical copy under .pnpm (transitive workspace deps
# don't appear at the top level of an isolated node_modules).
RUN for d in /app/dist/packages/*/; do \
      name=$(basename "$d"); \
      found=""; \
      for dest in /app/deploy/node_modules/.pnpm/@govtech-bb+"$name"@*/node_modules/@govtech-bb/"$name"; do \
        [ -d "$dest/src" ] || continue; \
        cp -RL "$d/src/." "$dest/src/"; \
        found=1; \
        echo "  overlaid compiled @govtech-bb/$name -> $dest"; \
      done; \
      [ -n "$found" ] || echo "  (no deployed copy of @govtech-bb/$name — not in this app's graph)"; \
    done

# ---- runner ----------------------------------------------------------------
# Matches the main API's runner pattern exactly.
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.30.0 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# Download AWS RDS CA bundle for TLS connections
RUN wget -O /app/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chown app:app /app/rds-ca-bundle.pem

RUN chown app:app /app
USER app

# Self-contained deploy output: project files + node_modules with the full
# resolved graph, workspace packages included (compiled JS overlaid in the
# builder). `node dist/main.js` resolves everything by walking up into
# ./node_modules — no symlink list to maintain.
COPY --from=builder --chown=app:app /app/deploy/ ./
COPY --from=builder --chown=app:app /app/apps/form_builder_api/dist/ ./dist/

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
ENV PORT=3003
EXPOSE 3003

CMD ["node", "--require", "reflect-metadata", "dist/main.js"]
