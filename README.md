# gov-bb

The **alpha.gov.bb** platform — a modular form component system and service
portal for Government of Barbados digital services. This is a TypeScript
monorepo (pnpm workspaces + Nx) housing the public-facing apps, the form
authoring tools, the backend APIs, and the shared `@govtech-bb/*` libraries
that keep form schemas, validation, and persistence aligned across them.

For a fuller architectural overview see [SPEC.md](SPEC.md). For how we work —
AI-assisted development, the test-first style, and the coverage policy — see
[CONTRIBUTING.md](CONTRIBUTING.md). For working on form recipes see
[FORM-CREATION-GUIDE.md](FORM-CREATION-GUIDE.md) and [FORMS.md](FORMS.md).

## Prerequisites

- Node.js >= 20
- pnpm 11.6.0 — run `corepack enable` (the version is pinned via
  `packageManager` in `package.json`, so corepack provisions it automatically)

## Getting started

```bash
pnpm install
```

## Project structure

```
apps/
  api/                NestJS backend — form definitions, submissions, processors (port 3001)
  forms/              Public forms SPA — Vite + TanStack Router/Form (dev 3000, Docker host 4200)
  landing/            Public discovery site — TanStack Start + Nitro SSR (port 3000)
  chat/               "Ask alpha.gov.bb" RAG assistant — TanStack Start + AWS Bedrock (port 3000)
  form_builder/       Form recipe authoring tool — Vite + TanStack Start (Nitro/Amplify)
  form_builder_api/   Backend for the builder — Express 5 (port 3003)
  analytics/          Internal analytics dashboard — Vite + React, renders a committed Umami snapshot (dev 3100)

packages/
  form-types/         Foundational TS + Zod types for the form domain (consumed everywhere)
  registry/           Built-in field/component definitions, single source of truth
  form-builder/       Recipe authoring & hydration utilities
  form-conditions/    Conditional-rendering logic primitives
  form-validation/    Field validation rules and runtime checks
  expressions/        JSON Logic + Luxon expression evaluation engine
  database/           TypeORM-backed persistence layer
  content/            Browser-safe Markdown/YAML content loading with Zod validation
  analytics/          Shared Umami analytics helper (forms, landing)
  ai-bedrock/         AWS Bedrock / Claude adapter (chat, form_builder_api)
  aws-secrets/        Shared AWS Secrets Manager helper
  git-publish/        Shared GitHub publish client for recipe deploys
```

> **Note:** `apps/cms`, `apps/web`, and `packages/preview-comments` are empty
> stubs (no `package.json` or source) and are candidates for removal — see
> [SPEC.md](SPEC.md).

The workspace globs are declared in `pnpm-workspace.yaml` (`apps/*`,
`packages/*`).

## Scripts

Root scripts cover the most-used apps; other apps run via `nx dev <app>` or
`pnpm --filter <pkg> dev`.

| Command | Description |
|---|---|
| `pnpm dev:forms` | Start the forms SPA in dev mode |
| `pnpm dev:api` | Start the API in dev mode |
| `pnpm dev:landing` | Start the landing site in dev mode |
| `pnpm exec nx dev chat` | Start the chat assistant in dev mode |
| `pnpm exec nx dev form_builder` | Start the form builder in dev mode |
| `pnpm exec nx dev analytics-app` | Start the analytics dashboard in dev mode |
| `pnpm build` | Build all apps and packages (`nx run-many -t build`) |
| `pnpm test:all` | Run the full test suite (`nx run-many -t test`) |
| `pnpm lint` | Lint all apps and packages |
| `pnpm format` / `pnpm format:check` | Format / check formatting (Prettier) |
| `pnpm migration:generate -- <path>` | Generate a TypeORM migration from entity changes |
| `pnpm migration:run` | Run all pending migrations |
| `pnpm migration:revert` | Revert the last migration |
| `pnpm migration:show` | Show applied / pending migration status |

> Tests run on **Vitest 4** (Jest has been removed). The full suite is ~30s.
> Build everything except `landing` offline — `landing`'s prebuild fetches a
> live form manifest (`pnpm exec nx run-many -t build --exclude=landing`).

## Environment variables

Each app ships a `.env.example` documenting its variables. Copy the ones you
need:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/forms/.env.example apps/forms/.env
cp apps/form_builder/.env.example apps/form_builder/.env
cp apps/form_builder_api/.env.example apps/form_builder_api/.env
```

The core database connection (`DB_HOST`, `DB_PORT`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_NAME`, `DB_SYNCHRONIZE`, `DB_LOGGING`) is shared by `api`,
`form_builder_api`, and the local Docker stack. `DB_SYNCHRONIZE=true` is for
local dev only — never enable it in production; use migrations instead.

## Local development with Docker

`docker-compose.yml` defines the full local stack (postgres + api + forms +
landing + chat + form_builder); `docker-compose.dev.yml` overlays bind-mounts
for hot reload. Postgres uses `pgvector/pgvector:pg16` to back the chat
assistant's embedding search.

## Deployment

- **Frontends (forms, landing) & chat** — AWS Amplify, driven by `amplify.yml`.
  `landing`, `chat`, and `form_builder` deploy as SSR (TanStack Start + Nitro)
  on Amplify Compute; `forms` is a static SPA build served from
  `apps/forms/dist`. Set environment variables in the Amplify console. Each PR
  gets an Amplify preview at `<branch>.<appId>.amplifyapp.com` — branch names
  must not contain a `.` (see [CLAUDE.md](CLAUDE.md)).
- **API** — containerized via `apps/api/Dockerfile`, deployed to AWS Fargate
  with images pushed to ECR. Set `API_PORT` and `DB_*` in the task definition.

## Database & migrations

The API uses PostgreSQL via TypeORM. The CLI DataSource is at
`apps/api/typeorm.config.ts`; migrations live in
`apps/api/src/database/migrations/` and run via the root `pnpm migration:*`
scripts.

## Path aliases

Shared packages resolve through `@govtech-bb/*` TypeScript path aliases
configured in `tsconfig.base.json` — e.g. `@govtech-bb/form-types`,
`@govtech-bb/registry`, `@govtech-bb/form-builder`, `@govtech-bb/form-conditions`,
`@govtech-bb/form-validation`, `@govtech-bb/expressions`, `@govtech-bb/database`,
`@govtech-bb/content`. Inter-package dependencies use the `workspace:*` protocol.

## Nx

```bash
pnpm exec nx graph              # Visualize the dependency graph
pnpm exec nx show projects      # List all projects
pnpm exec nx run forms:build    # Build a single project
```
