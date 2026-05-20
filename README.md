# modular-forms-monorepo

Modular form component system for Barbados government services.

## Prerequisites

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm@10` or `corepack enable && corepack prepare pnpm@10.33.4 --activate`)

## Getting started

```bash
pnpm install
```

## Project structure

```
apps/
  web/          Next.js frontend, modular forms (port 4200)
  api/          NestJS backend (port 3001)
  landing/      TanStack Start landing site (port 3000)

packages/
  form-types/       Shared TypeScript types
  form-conditions/  Condition evaluation logic
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev:web` | Start web app in dev mode |
| `pnpm dev:api` | Start API in dev mode |
| `pnpm dev:landing` | Start landing site in dev mode |
| `pnpm start:web` | Start web app in production mode |
| `pnpm start:api` | Start API in production mode |
| `pnpm start:landing` | Start landing site in production mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Lint all apps and packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm migration:generate <path>` | Generate a migration from entity changes |
| `pnpm migration:run` | Run all pending migrations |
| `pnpm migration:revert` | Revert the last migration |
| `pnpm migration:show` | Show applied / pending migration status |

## Environment variables

Copy the example files and adjust as needed:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

| Variable | App | Default | Description |
|---|---|---|---|
| `PORT` | web | `4200` | Next.js server port |
| `VITE_API_URL` | web | `http://localhost:3001` | API base URL |
| `API_PORT` | api | `3001` | NestJS server port |
| `DB_HOST` | api | `localhost` | PostgreSQL host |
| `DB_PORT` | api | `5432` | PostgreSQL port |
| `DB_USERNAME` | api | `postgres` | Database user |
| `DB_PASSWORD` | api | `postgres` | Database password |
| `DB_NAME` | api | `modular_forms` | Database name |
| `DB_SYNCHRONIZE` | api | `false` | Auto-sync schema (dev only — never `true` in production) |
| `DB_LOGGING` | api | `false` | Log all SQL queries |

## Deployment

### Web (AWS Amplify)

The `amplify.yml` at the repo root configures the build. Amplify installs `pnpm`, runs `pnpm exec nx run web:build`, and serves from `apps/web/dist`.

Set environment variables in the Amplify console.

### API (AWS Fargate)

A Dockerfile is provided at `apps/api/Dockerfile`. Build and push to ECR:

```bash
docker build -f apps/api/Dockerfile -t govtech-api .
```

Set `API_PORT` and all `DB_*` variables in the ECS task definition environment variables.

## Database

The API uses PostgreSQL via TypeORM. The connection is configured through the `DB_*` environment variables above.

### Migrations

The TypeORM CLI DataSource is at `apps/api/typeorm.config.ts`. Run migrations from the repo root:

```bash
# Generate a new migration from entity changes
pnpm migration:generate src/database/migrations/<MigrationName>

# Run pending migrations
pnpm migration:run

# Revert the last migration
pnpm migration:revert

# Show migration status
pnpm migration:show
```

Migration files are stored in `apps/api/src/database/migrations/`.

> **Note:** `DB_SYNCHRONIZE=true` auto-syncs the schema on startup — useful in local dev but must never be enabled in production. Use migrations instead.

## Path aliases

Shared packages are available via these TypeScript path aliases (configured in `tsconfig.base.json`):

- `@govtech-bb/form-types`
- `@govtech-bb/form-conditions`

## Nx

```bash
pnpm exec nx graph          # Visualize the dependency graph
pnpm exec nx show projects  # List all projects
pnpm exec nx build web      # Build a single project
```

## Toolchain divergence

`apps/landing` pins its own versions of React, TypeScript, Vite, and Vitest in `apps/landing/package.json`. It tracks the upstream [`alphagovbb`](https://github.com/govtech-bb/alphagovbb) repo on TanStack Start, which sits ahead of the rest of this monorepo:

| Package | `apps/web`, `apps/api`, root | `apps/landing` |
|---|---|---|
| React | 18 | 19 |
| TypeScript | 5.7 | 6 |
| Build tool | Next.js / tsc | Vite 8 |
| Test runner | Jest | Vitest 4 |

pnpm respects each workspace's pinned versions when resolving dependencies. Per-workspace `package.json` (like `apps/landing`'s) drives what each app gets. If you bump versions for `web`/`api`, leave `apps/landing` alone unless you're also syncing with upstream.

> **Note on `node-linker=hoisted`.** The repo's `.npmrc` sets `node-linker=hoisted`, which makes pnpm produce a flat `node_modules` tree like npm/yarn. This matches what the codebase has historically assumed (some packages rely on transitively-hoisted dev types — e.g. `@types/jest`). Moving to pnpm's stricter default (`isolated`) is a separate, follow-up task that would require declaring those types in each package that uses them.
