# syntax=docker/dockerfile:1.7
# TanStack Start landing site. The upstream `start` script
# (`node --import dist/server/server.js`) doesn't bind a port — the SSR bundle
# is a fetch-handler, not a Node HTTP server. Production hosting is Amplify,
# not this image, so the container runs the Vite dev server.
#
# The build step is preserved so `docker compose build` validates that the app
# still builds cleanly with the current dependency tree.

FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/landing/package.json apps/landing/
COPY apps/web/package.json apps/web/
COPY packages/expressions/package.json packages/expressions/
COPY packages/form-conditions/package.json packages/form-conditions/
COPY packages/form-types/package.json packages/form-types/
COPY packages/form-validation/package.json packages/form-validation/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/landing/ apps/landing/

RUN pnpm exec nx build landing

# ---- runner -------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm@10.33.4

# Bring across the installed deps + the entire landing app so `vite dev`
# has everything it needs. compose can overlay bind-mounts on top of these
# paths for hot reload (see docker-compose.dev.yml).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/nx.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/apps/landing/ ./apps/landing/
COPY --from=builder /app/apps/landing/dist ./apps/landing/dist

ENV NODE_ENV=development
EXPOSE 3000

# Call vite directly from the landing workspace. Going through `nx dev landing`
# loses the --host flag because apps/landing/project.json's run-commands
# executor doesn't forward CLI args to the underlying script.
WORKDIR /app/apps/landing
CMD ["pnpm", "exec", "vite", "dev", "--host", "0.0.0.0", "--port", "3000"]
