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
COPY packages/content/package.json packages/content/
COPY packages/design/package.json packages/design/
COPY packages/react/package.json packages/react/
COPY packages/form-types/package.json packages/form-types/
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
# Payload's importmap step writes into src/; needs to run before build.
RUN pnpm --filter cms run generate:importmap || true
RUN pnpm --filter cms run build

# ---------- runner: minimal image, non-root user ------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat
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
