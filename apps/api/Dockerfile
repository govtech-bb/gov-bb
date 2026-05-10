FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json nx.json tsconfig.base.json ./
COPY apps/api/ apps/api/
COPY packages/ packages/

RUN npm install --ignore-scripts
RUN npx nx build api

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/dist/apps/api/ ./dist/
COPY --from=builder /app/dist/packages/ ./packages/
COPY --from=builder /app/packages/form-types/src/ ./packages/form-types/src/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.base.json ./
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/
COPY --from=builder /app/apps/api/typeorm.config.ts ./apps/api/
COPY --from=builder /app/apps/api/src/database/ ./apps/api/src/database/
# Form Builder AI system prompt
COPY --from=builder /app/apps/api/src/form-builder/prompts/ ./apps/api/src/form-builder/prompts/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
