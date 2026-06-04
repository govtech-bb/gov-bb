# syntax=docker/dockerfile:1.7
#
# Production image for the gov.bb CMS (Payload 3 on Next.js).
#
# Build from the MONOREPO ROOT so the workspace lockfile and the other
# packages are visible to pnpm:
#   docker build -f apps/cms/Dockerfile -t gov-bb-cms .
#
# At runtime the container expects DATABASE_URL, PAYLOAD_SECRET, and the
# other env vars listed in apps/cms/.env.example. See
# docs/cms-production-deploy.md for the full list.

# ---------- deps: install workspace dependencies once -------------------------
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo

RUN corepack enable

# Copy just what pnpm needs to resolve the workspace; this layer caches as
# long as the lockfile + manifests haven't changed.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/cms/package.json apps/cms/
COPY packages/ai-bedrock/package.json packages/ai-bedrock/
COPY packages/content/package.json packages/content/
COPY packages/database/package.json packages/database/
COPY packages/expressions/package.json packages/expressions/
COPY packages/form-builder/package.json packages/form-builder/
COPY packages/form-conditions/package.json packages/form-conditions/
COPY packages/form-types/package.json packages/form-types/
COPY packages/form-validation/package.json packages/form-validation/
COPY packages/registry/package.json packages/registry/

RUN pnpm install --frozen-lockfile

# ---------- builder: compile the CMS standalone output ------------------------
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /repo
RUN corepack enable

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/cms/node_modules ./apps/cms/node_modules
COPY --from=deps /repo/packages ./packages
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Build the Next.js standalone output. The Payload importmap (src/app/(payload)/
# admin/importMap.js) is committed to the repo — DO NOT regenerate it here.
# payload.config.ts gates the s3Storage plugin on process.env.S3_BUCKET, which
# is only set at runtime (ECS task-def env). Running `payload generate:importmap`
# at build time would see no S3 plugin and rewrite the file WITHOUT the S3
# entries, then fail at runtime when the actual plugin activates and looks for
# components that the freshly-stripped importmap no longer references — silent
# SSR bail-out, blank admin pages. Developers regenerate locally with the runtime
# env (e.g. `S3_BUCKET=... pnpm --filter cms run generate:importmap`) and commit
# the result whenever payload.config.ts changes.
RUN pnpm --filter cms run build

# ---------- runner: minimal image, non-root user ------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat ca-certificates curl

# RDS global CA bundle for TLS verification against sandbox/prod RDS Postgres.
# payload.config.ts reads DATABASE_SSL_CA_PATH and passes the cert to pg's pool,
# so connections verify the RDS server certificate instead of trusting any cert
# presented (defends against MITM on the VPC traffic path). The bundle is
# published by AWS and rotates infrequently — rebuilds pick up new versions.
RUN curl -fsSL -o /etc/ssl/certs/rds-global-bundle.pem \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone output in a monorepo lays out as:
#   .next/standalone/                  ← server.js, traced node_modules
#     apps/cms/server.js
#     apps/cms/.next/static            (we copy this in below)
#     apps/cms/public                  (we copy this in below)
COPY --from=builder --chown=nextjs:nodejs /repo/apps/cms/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/cms/.next/static ./apps/cms/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/cms/public ./apps/cms/public

USER nextjs

EXPOSE 3000
CMD ["node", "apps/cms/server.js"]
