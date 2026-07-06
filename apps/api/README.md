# @govtech-bb/api

The NestJS backend for the alpha.gov.bb forms platform. It serves form
definitions (recipes), manages drafts, validates and persists submissions, and
dispatches submissions to processors (email via SES, payment via EzPay,
spreadsheet export, webhooks).

For the full architecture — modules, submission lifecycle, processor model,
rate-limiting tiers — see [SPEC.md](./SPEC.md). For how recipes are authored and
served see the root [FORM-CREATION-GUIDE.md](../../FORM-CREATION-GUIDE.md) and
[docs/form-recipes.md](../../docs/form-recipes.md).

## Stack

NestJS 11 · TypeORM + PostgreSQL · AWS SDK (S3, SES v2, SQS) · OpenTelemetry ·
Handlebars (email templating) · `json-logic-js` (expression evaluation).

## Running

```bash
pnpm dev:api            # from repo root — watch mode on port 3001
# or
pnpm exec nx start api  # production mode
```

Requires a running PostgreSQL (`pgvector/pgvector:pg16` via `docker compose up
postgres`). Copy [`.env.example`](./.env.example) to `.env` for the `DB_*`,
`EZPAY_*`, `UPLOAD_*`, and `WEBHOOK_*` variables.

## Tests

```bash
pnpm exec nx test api   # Vitest 4
```

> apps/api transforms its tests with swc (`unplugin-swc` in `vitest.config.ts`)
> so NestJS DI metadata (`design:paramtypes`) is emitted — keep that plugin in
> place when touching the test config.

## Database & migrations

The TypeORM CLI DataSource is at `typeorm.config.ts`; migrations live in
`src/database/migrations/`. Run them from the repo root via `pnpm migration:run`
/ `migration:generate` / `migration:revert` / `migration:show`.

## Recipes

Runtime form recipes load from files at
`src/forms/form-definitions/recipes/{formId}/{version}.json`. Edit a file, then
**restart the API** (no hot reload for recipes).

## Deployment

Containerized via [`Dockerfile`](./Dockerfile) and deployed to AWS Fargate
(images pushed to ECR). Set `API_PORT` and all `DB_*` variables in the ECS task
definition.
