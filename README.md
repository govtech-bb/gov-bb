# modular-forms-monorepo

Modular form component system for Barbados government services.

## Prerequisites

- Node.js >= 20
- npm >= 10

## Getting started

```bash
npm install
```

## Project structure

```
apps/
  web/          Next.js frontend (port 4200)
  api/          NestJS backend  (port 3001)

packages/
  form-types/       Shared TypeScript types
  form-conditions/  Condition evaluation logic
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev:web` | Start web app in dev mode |
| `npm run dev:api` | Start API in dev mode |
| `npm run start:web` | Start web app in production mode |
| `npm run start:api` | Start API in production mode |
| `npm run build` | Build all apps and packages |
| `npm run lint` | Lint all apps and packages |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without writing |
| `npm run migration:generate -- <path>` | Generate a migration from entity changes |
| `npm run migration:run` | Run all pending migrations |
| `npm run migration:revert` | Revert the last migration |
| `npm run migration:show` | Show applied / pending migration status |

## Environment variables

Copy the example files and adjust as needed:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

| Variable | App | Default | Description |
|---|---|---|---|
| `PORT` | web | `4200` | Next.js server port |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:3001` | API base URL |
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

The `amplify.yml` at the repo root configures the build. Amplify runs `npx nx build web` and serves from `apps/web/.next`.

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
npm run migration:generate -- src/database/migrations/<MigrationName>

# Run pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

Migration files are stored in `apps/api/src/database/migrations/`.

> **Note:** `DB_SYNCHRONIZE=true` auto-syncs the schema on startup — useful in local dev but must never be enabled in production. Use migrations instead.

## Path aliases

Shared packages are available via these TypeScript path aliases (configured in `tsconfig.base.json`):

- `@govtech-bb/form-types`
- `@govtech-bb/form-conditions`

## Nx

```bash
npx nx graph          # Visualize the dependency graph
npx nx show projects  # List all projects
npx nx build web      # Build a single project
```
