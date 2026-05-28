# syntax=docker/dockerfile:1.7
# Form Builder API — lightweight Express server for form CRUD + AI/Bedrock calls.
# Runs behind the existing ALB at /builder/*.

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app
RUN chown app:app /app
USER app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./
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
COPY --chown=app:app apps/form_builder/app/server/ai-builder/prompts/ apps/form_builder/app/server/ai-builder/prompts/
COPY --chown=app:app packages/ packages/

# Build the API and all workspace deps (Nx handles the dependency graph via dependsOn: ["^build"])
RUN pnpm exec nx build form-builder-api

# ---- runner ----------------------------------------------------------------
# Matches the main API's runner pattern exactly.
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

WORKDIR /app

# Download AWS RDS CA bundle for TLS connections
RUN wget -O /app/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem && \
    chown app:app /app/rds-ca-bundle.pem

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

# Workspace package symlinks so require("@govtech-bb/database") resolves
RUN mkdir -p node_modules/@govtech-bb && \
    ln -sfn ../../packages/database node_modules/@govtech-bb/database && \
    ln -sfn ../../packages/form-builder node_modules/@govtech-bb/form-builder && \
    ln -sfn ../../packages/form-types node_modules/@govtech-bb/form-types && \
    ln -sfn ../../packages/form-conditions node_modules/@govtech-bb/form-conditions && \
    ln -sfn ../../packages/form-validation node_modules/@govtech-bb/form-validation && \
    ln -sfn ../../packages/expressions node_modules/@govtech-bb/expressions && \
    ln -sfn ../../packages/registry node_modules/@govtech-bb/registry

# Package manifests needed for module resolution
COPY --from=builder --chown=app:app /app/packages/database/package.json ./packages/database/
COPY --from=builder --chown=app:app /app/packages/form-builder/package.json ./packages/form-builder/
COPY --from=builder --chown=app:app /app/packages/form-types/package.json ./packages/form-types/
COPY --from=builder --chown=app:app /app/packages/form-conditions/package.json ./packages/form-conditions/
COPY --from=builder --chown=app:app /app/packages/form-validation/package.json ./packages/form-validation/
COPY --from=builder --chown=app:app /app/packages/expressions/package.json ./packages/expressions/
COPY --from=builder --chown=app:app /app/packages/registry/package.json ./packages/registry/

# Root package.json + tsconfig for path resolution
COPY --from=builder --chown=app:app /app/package.json ./
COPY --from=builder --chown=app:app /app/tsconfig.base.json ./
COPY --from=builder --chown=app:app /app/apps/form_builder_api/package.json ./apps/form_builder_api/
COPY --from=builder --chown=app:app /app/apps/form_builder_api/tsconfig.json ./apps/form_builder_api/

# AI system prompt
COPY --from=builder --chown=app:app /app/apps/form_builder/app/server/ai-builder/prompts/ ./prompts/

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
ENV PORT=3003
EXPOSE 3003

CMD ["node", "--require", "reflect-metadata", "dist/main.js"]
