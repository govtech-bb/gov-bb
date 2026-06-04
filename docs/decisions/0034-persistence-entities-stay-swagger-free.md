# 0034 — Persistence entities live in `@govtech-bb/database` and stay swagger-free

**Date:** 2026-06-04
**Status:** Accepted

## Context

Issue #721: `apps/api` and `packages/database` each maintained hand-mirrored
copies of the TypeORM entities and migrations. The copies drifted — two
migrations and an entity existed only api-side, one migration only
package-side, and the package's `FormSubmissionEntity` was missing the
`reference_code` column the api copy had. Every new entity or migration had to
be authored twice, and nothing enforced that the twins stayed identical.

The api copies also carried `@ApiProperty` decorators so two endpoints could
reference entities as swagger response types. Consolidating into the shared
package forced the question: does the package depend on `@nestjs/swagger`, or
do the decorators move?

## Decision

`@govtech-bb/database` is the **single source of truth** for TypeORM entities
and migrations.

- Entities and migrations are authored **once**, in the package, and
  registered in its exported `entities` / `migrations` arrays. Apps consume
  those arrays (`apps/api`'s `AppDataSource` no longer globs its own tree).
- Apps never maintain copies. `apps/api`'s former entity files are re-export
  shims kept only so existing imports compile; new code should import
  `@govtech-bb/database` directly.
- The package stays **framework-free**: no `@nestjs/swagger` (or other Nest)
  dependency. Apps that need to document API responses define their own DTO
  classes carrying `@ApiProperty` (e.g. `FormDraftResponseDto`,
  `FormSubmissionResponseDto`) and keep them mirrored to the entity shape.

Rejected alternatives: making the package depend on `@nestjs/swagger` (couples
every consumer to Nest for the benefit of two endpoints); the Nest swagger CLI
plugin (doesn't apply to code compiled in a separate `@nx/js:tsc` package).

## Consequences

- A new entity or migration lands in `packages/database` exactly once and
  runs everywhere — `apps/api`'s boot/migrate path and
  `apps/form_builder_api`'s `createDataSource()` can no longer drift.
- Migration classes are exported from the package index, so api smoke specs
  import them directly instead of reflecting over migration files on disk.
- Response documentation is decoupled from persistence: changing an entity
  requires a deliberate matching edit to any response DTO that mirrors it
  (the price of keeping the package framework-free).
- Local `migration:*` scripts register `tsconfig-paths` to resolve the
  package from source; in the runtime image the mapped `.ts` path is absent
  and resolution falls back to the compiled package.
