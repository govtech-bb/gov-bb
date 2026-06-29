# 0061 — API DataSource bootstrap is shared and verifies TLS in production

## Context

`apps/api` (NestJS) and `apps/form_builder_api` (plain Express) both connect to
the same RDS Postgres through `@govtech-bb/database`'s entities and migrations,
but each hand-rolled its own mapping of the standard `DB_*` env vars to TypeORM
options. The two copies diverged on a security-relevant axis: `apps/api`
verified the database server's certificate in production
(`ssl: { rejectUnauthorized: true }`, with optional `DB_SSL_CA` pinning), while
`form_builder_api` disabled verification (`rejectUnauthorized: false`). A
consolidation audit filed this as ARCH-06 (issue #1408): the divergence existed
*because* the config was duplicated rather than shared.

## Decision

API apps build their TypeORM `DataSource` through the shared
`@govtech-bb/database` env helper rather than re-implementing the env→options
mapping:

- `dbOptionsFromEnv(overrides?)` reads `DB_HOST`/`DB_PORT`/`DB_USERNAME`/
  `DB_PASSWORD`/`DB_NAME`, `DB_SYNCHRONIZE`, `DB_LOGGING`, sets
  `type: "postgres"` and `ssl: buildSslConfig()`, and returns the options
  (minus `entities`/`migrations`, which the package owns).
- `createDataSourceFromEnv(overrides?)` wraps `createDataSource(dbOptionsFromEnv())`.
- `buildSslConfig()` is the single, canonical SSL policy: **non-production →
  `false`; production with no CA → `{ rejectUnauthorized: true }`; production
  with `DB_SSL_CA` → `{ rejectUnauthorized: true, ca }`** where `DB_SSL_CA` holds
  either the PEM contents or a path to a PEM file.

On this shared path, **production database connections always verify the
server's certificate**. No API app disables certificate verification.

The lazy-singleton init wrapper stays app-local (`form_builder_api`'s
`getDataSource()`); only the env→options+SSL mapping is shared.

This scope is the API apps that bootstrap through `@govtech-bb/database`.
`apps/chat` runs a separate stack with its own `DB_SSL_REJECT_UNAUTHORIZED`
toggle and is not covered here.

## Consequences

- A new API app that needs a DataSource calls `createDataSourceFromEnv()` — it
  must not reintroduce a local `DB_*`→TypeORM mapping or an
  `ssl: { rejectUnauthorized: false }` shortcut. Reviewers should treat a
  per-app re-implementation or a disabled-verification SSL option as a defect.
- The helper adopts dev-friendly connection defaults
  (`localhost`/`postgres`/`postgres`/`modular_forms`) so a bare local Postgres
  works without a `.env`; production task definitions set every `DB_*` value
  explicitly, so the defaults only ever apply in local/dev.
- **Deploy precondition.** Turning on verification for `form_builder_api` in
  production requires its ECS task def to trust the RDS CA — either Amazon's
  public root (covered by Node's built-in trust store) or an explicit
  `DB_SSL_CA`. `apps/api` already verifies strictly against the same RDS, which
  is the evidence the flip is safe.
