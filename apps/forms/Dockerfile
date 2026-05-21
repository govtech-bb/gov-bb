# syntax=docker/dockerfile:1.7
# Modular forms web app (Vite SPA). Production hosting is Amplify, which
# serves the static build from apps/web/dist. This image runs the Vite dev
# server for local-stack parity inside compose.
#
# The build step runs the same `nx run web:build` Amplify uses, so this image
# also validates the production build.

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

# web's tsconfig references form-types, form-conditions, and form-validation —
# easier to copy all packages than to maintain a list as deps shift.
COPY apps/web/ apps/web/
COPY packages/ packages/

RUN pnpm exec nx run form-types:build && \
    pnpm exec nx run form-conditions:build && \
    pnpm exec nx run web:build

# ---- runner -------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm@10.33.4

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/nx.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/apps/web/ ./apps/web/
COPY --from=builder /app/packages/ ./packages/

ENV NODE_ENV=development
EXPOSE 3000

WORKDIR /app/apps/web
CMD ["pnpm", "exec", "vite", "dev", "--host", "0.0.0.0", "--port", "3000"]
