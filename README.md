# modular-forms-monorepo

Modular form component system for Barbados government services.

## Prerequisites

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm@10` or `corepack enable && corepack prepare pnpm@10.33.4 --activate`)

## Getting started

```bash
pnpm install
```

## Running with Docker

Bring up the whole stack (api + postgres + landing + web) in one command, no global Node / Postgres install required. Written for someone who has never used Docker before — every step explained.

### One-time setup

1. **Install Docker Desktop.** Free for personal / educational use. <https://www.docker.com/products/docker-desktop/> — pick the right installer for your OS (Apple Silicon, Intel Mac, Windows, Linux). Open the app once after install so the Docker engine starts in the background.
2. **Copy the env template:**
   ```bash
   cp .env.docker.example .env.docker
   ```
   You can edit `.env.docker` later if you need to (different DB password, different ports). The defaults work out of the box.

### Daily commands

```bash
# Start everything in the background.
docker compose --env-file .env.docker up -d

# Watch what's happening (Ctrl+C exits but containers keep running):
docker compose logs -f

# Stop everything (containers stay around — fast restart):
docker compose stop

# Stop and remove containers (DB volume kept — data survives):
docker compose down

# Stop, remove containers AND wipe the postgres volume (full reset):
docker compose down -v
```

Once `up -d` finishes you can browse:

| URL                                      | What it is                                                |
| ---------------------------------------- | --------------------------------------------------------- |
| <http://localhost:3000>                  | landing site                                              |
| <http://localhost:4200>                  | web (forms)                                               |
| <http://localhost:3001/health>           | api health check (returns `{}` when healthy)              |
| <http://localhost:3001/form-definitions> | api — should return the seeded `example-name-change` form |
| <http://localhost:3001/api-docs>         | api — Swagger UI                                          |

The api runs database migrations on startup and (when `SEED_ON_BOOT=true`) inserts an example `FormDefinition` so the stack isn't empty on first run. The seed is idempotent — re-running won't duplicate rows.

### Hot reload while you code (landing + web)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This overlay bind-mounts `apps/landing/src` and `apps/web/src` into the running containers, so editing a `.tsx` file in your editor triggers a Vite rebuild without restarting anything.

> **Note:** The dev overlay does not include the api. NestJS dev mode needs `@nestjs/cli` (the `nest` binary), which isn't a declared dependency in this monorepo. If you're iterating on the api, the lowest-friction loop is:
>
> ```bash
> docker compose up postgres -d   # just postgres in a container
> pnpm dev:api                    # nest start --watch on your host
> ```

### What's inside the box

- **`apps/api/Dockerfile`, `apps/landing/Dockerfile`, `apps/web/Dockerfile`** — multi-stage builds. The builder stage installs deps with pnpm and runs the app's build target; the runtime stage carries just what each app needs to serve.
- **`docker-compose.yml`** — the four services + a commented-out `chat:` placeholder for the future chat app.
- **`docker-compose.dev.yml`** — overlay that adds source bind-mounts for hot reload.
- **`.env.docker.example`** — every env var the stack reads, with comments.
- **`.dockerignore`** — root-level; controls what gets sent into each image build context.

### First-time troubleshooting

- **`Bind for 0.0.0.0:3000 failed: port is already allocated`** — another process is using one of the ports. Change the host port in `.env.docker` (e.g. `DB_PORT=5433`) or `docker-compose.yml`, or stop the conflicting process.
- **`The server does not support SSL connections`** in api logs — the local postgres-alpine container doesn't speak SSL. compose already sets `NODE_ENV=development` on the api service to disable SSL in the connection; if you've overridden that, set it back.
- **`docker compose` not found, only `docker-compose`** — older Docker installs ship the legacy `docker-compose` binary instead of the `docker compose` subcommand. Either works; the commands above are the same just with a dash.
- **api crashes with `Cannot find module '@govtech-bb/form-types'`** — the workspace symlinks were missed during build. Run `docker compose build api --no-cache` to do a clean rebuild.
- **Hot reload doesn't pick up changes on Windows / WSL2** — file change events from the Windows host can lag into the Linux container. Working from `\\wsl$\...` (inside the WSL2 filesystem) is faster than `C:\Users\...`.

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

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `pnpm dev:web`                   | Start web app in dev mode                |
| `pnpm dev:api`                   | Start API in dev mode                    |
| `pnpm dev:landing`               | Start landing site in dev mode           |
| `pnpm start:web`                 | Start web app in production mode         |
| `pnpm start:api`                 | Start API in production mode             |
| `pnpm start:landing`             | Start landing site in production mode    |
| `pnpm build`                     | Build all apps and packages              |
| `pnpm lint`                      | Lint all apps and packages               |
| `pnpm format`                    | Format all files with Prettier           |
| `pnpm format:check`              | Check formatting without writing         |
| `pnpm migration:generate <path>` | Generate a migration from entity changes |
| `pnpm migration:run`             | Run all pending migrations               |
| `pnpm migration:revert`          | Revert the last migration                |
| `pnpm migration:show`            | Show applied / pending migration status  |

## Environment variables

Copy the example files and adjust as needed:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

| Variable         | App | Default                 | Description                                              |
| ---------------- | --- | ----------------------- | -------------------------------------------------------- |
| `PORT`           | web | `4200`                  | Next.js server port                                      |
| `VITE_API_URL`   | web | `http://localhost:3001` | API base URL                                             |
| `API_PORT`       | api | `3001`                  | NestJS server port                                       |
| `DB_HOST`        | api | `localhost`             | PostgreSQL host                                          |
| `DB_PORT`        | api | `5432`                  | PostgreSQL port                                          |
| `DB_USERNAME`    | api | `postgres`              | Database user                                            |
| `DB_PASSWORD`    | api | `postgres`              | Database password                                        |
| `DB_NAME`        | api | `modular_forms`         | Database name                                            |
| `DB_SYNCHRONIZE` | api | `false`                 | Auto-sync schema (dev only — never `true` in production) |
| `DB_LOGGING`     | api | `false`                 | Log all SQL queries                                      |

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

| Package     | `apps/web`, `apps/api`, root | `apps/landing` |
| ----------- | ---------------------------- | -------------- |
| React       | 18                           | 19             |
| TypeScript  | 5.7                          | 6              |
| Build tool  | Next.js / tsc                | Vite 8         |
| Test runner | Jest                         | Vitest 4       |

pnpm respects each workspace's pinned versions when resolving dependencies. Per-workspace `package.json` (like `apps/landing`'s) drives what each app gets. If you bump versions for `web`/`api`, leave `apps/landing` alone unless you're also syncing with upstream.

> **Note on `node-linker=hoisted`.** The repo's `.npmrc` sets `node-linker=hoisted`, which makes pnpm produce a flat `node_modules` tree like npm/yarn. This matches what the codebase has historically assumed (some packages rely on transitively-hoisted dev types — e.g. `@types/jest`). Moving to pnpm's stricter default (`isolated`) is a separate, follow-up task that would require declaring those types in each package that uses them.
