# syntax=docker/dockerfile:1.7
# ---- builder ------------------------------------------------------------
# Compiles the NestJS app + the workspace packages it depends on into
# /app/dist, using the full monorepo as context.
FROM node:20-alpine AS builder

WORKDIR /app

# Pin pnpm to the version declared in the root package.json's `packageManager` field.
RUN npm install -g pnpm@10.33.4

# Copy package-manager metadata first so the install layer caches when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./

# Per-workspace manifests are required for pnpm to resolve the workspace graph.
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
COPY apps/web/package.json apps/web/
COPY packages/expressions/package.json packages/expressions/
COPY packages/form-conditions/package.json packages/form-conditions/
COPY packages/form-types/package.json packages/form-types/
COPY packages/form-validation/package.json packages/form-validation/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Source — copy only what's needed to build `api`.
COPY apps/api/ apps/api/
COPY packages/ packages/

RUN pnpm exec nx build api

# ---- runner -------------------------------------------------------------
# Slim runtime image. Includes pnpm so the ECS sandbox migrate-task
# (deploy-sandbox.yml) can shell into the container and run `pnpm migration:run`.
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY --from=builder /app/dist/apps/api/ ./dist/
COPY --from=builder /app/dist/packages/ ./packages/
COPY --from=builder /app/packages/form-types/src/ ./packages/form-types/src/
COPY --from=builder /app/node_modules/ ./node_modules/

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
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder /app/apps/api/typeorm.config.ts ./apps/api/
COPY --from=builder /app/apps/api/src/database/ ./apps/api/src/database/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
