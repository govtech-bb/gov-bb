# CLAUDE.md — apps/api

The forms backend. Nx project `api`; NestJS 11 + TypeORM on Postgres, running as a container on
ECS/Fargate. Read the root `CLAUDE.md` first; this file adds what is specific here.

## Build and layout

- Feature modules live under `src/` (entry `src/app.module.ts`). This is the only app built with
  the `@nx/js:tsc` executor, so the monorepo build contract in the root file applies directly.
- The build copies assets (`project.json`): recipe JSON from `src/forms/form-definitions/recipes/`,
  `.hbs` email templates from `src/email/templates/`, `.geojson` catchments from `src/catchment/`.
- `src/content/services-index.generated.ts` is generated — regenerate with
  `pnpm generate:services-index`, never edit.
- `pnpm dev:api` first symlinks `dist/src` to `node_modules/@` for the `@` path alias; run it
  through the script, not `nx dev api` directly.

## Recipes

Form recipes are flat files, `src/forms/form-definitions/recipes/<formId>.json`, one per form, edited
in place. Author them through the `form-design` skill. `pnpm validate-recipes` is the fastest gate;
the same invariants are enforced at boot, so a bad recipe aborts a deploy.

## Tests transform with swc — keep the plugin

Tests transform with swc (`unplugin-swc` in `vitest.config.ts`) because Vitest's default esbuild
transform can't emit the `design:paramtypes` metadata NestJS DI resolves constructors from. Keep
that plugin in place when touching the test config.

Coverage floors in `vitest.config.ts` are 89 % branches, 95 % functions, 98 % lines, 97 % statements
(ADR 0001, ADR 0003). Deleting or skipping a test breaks CI. A single spec run trips the floors, so
use `pnpm exec vitest run <name> --coverage.enabled=false` for one file.

## Database and deploy

- Migrations run through the root scripts (`pnpm migration:generate -- <path>`, `migration:run`,
  `migration:revert`, `migration:show`); see `src/database/migrations/README.md`.
- In the image, migrations run from compiled JS as a one-off ECS task before the service updates
  (#2669). Runner stages have no package manager — never reintroduce one.
- `README.md` and `SPEC.md` here cover the HTTP surface, processors and rate-limiting tiers.
