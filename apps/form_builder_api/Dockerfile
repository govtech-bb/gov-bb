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

WORKDIR /app/apps/form_builder_api
RUN pnpm exec tsc && pnpm exec tsc-alias

# ---- runner ----------------------------------------------------------------
FROM node:20-alpine AS runner

RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

# Download AWS RDS CA bundle for TLS connections
RUN wget -O /tmp/rds-ca-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

WORKDIR /app
RUN chown app:app /app
RUN cp /tmp/rds-ca-bundle.pem /app/rds-ca-bundle.pem && chown app:app /app/rds-ca-bundle.pem
USER app

COPY --from=builder --chown=app:app /app/apps/form_builder_api/dist/ ./dist/
COPY --from=builder --chown=app:app /app/apps/form_builder_api/package.json ./
COPY --from=builder --chown=app:app /app/node_modules/ ./node_modules/
COPY --from=builder --chown=app:app /app/packages/ ./packages/
COPY --from=builder --chown=app:app /app/apps/form_builder/app/server/ai-builder/prompts/ ./prompts/

# Symlinks for workspace packages
RUN mkdir -p node_modules/@govtech-bb && \
    ln -sfn ../../packages/database node_modules/@govtech-bb/database && \
    ln -sfn ../../packages/form-builder node_modules/@govtech-bb/form-builder && \
    ln -sfn ../../packages/form-types node_modules/@govtech-bb/form-types && \
    ln -sfn ../../packages/form-conditions node_modules/@govtech-bb/form-conditions && \
    ln -sfn ../../packages/form-validation node_modules/@govtech-bb/form-validation && \
    ln -sfn ../../packages/expressions node_modules/@govtech-bb/expressions

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-ca-bundle.pem
ENV PORT=3003
EXPOSE 3003

CMD ["node", "dist/main.js"]
