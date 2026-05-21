# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.30.0

# Copy workspace metadata for pnpm install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./
COPY apps/landing/package.json apps/landing/
COPY packages/form-types/package.json packages/form-types/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY apps/landing/ apps/landing/
COPY packages/ packages/

# Build
RUN pnpm exec nx run landing:build

# ---- runner -----------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Copy the built server output
COPY --from=builder /app/apps/landing/dist/ ./dist/
COPY --from=builder /app/apps/landing/package.json ./

# The Tanstack Start server listens on port 3000 by default
ENV PORT=3000
EXPOSE 3000

CMD ["node", "--import", "dist/server/server.js"]
