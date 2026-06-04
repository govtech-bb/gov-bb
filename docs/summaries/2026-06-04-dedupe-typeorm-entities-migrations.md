# 2026-06-04 — Deduplicate TypeORM entities & migrations (#721)

## Context

`apps/api` and `packages/database` each carried hand-mirrored TypeORM
entities and migrations, and they had drifted (two migrations + one entity
api-only, one migration package-only). Session executed the plan from issue
#721 to make the package the single source of truth.

## What we did

- Reconciled `packages/database` to the superset and made the
  never-yet-executed `AddFormDefinitionUniqueConstraint` migration defensive
  (pre-checks for `(form_id, version)` duplicates, fails naming the rows).
- Pointed `apps/api`'s `AppDataSource` at the package's exported arrays;
  turned the 11 api entity files into re-export shims; deleted api migration
  files; smoke specs now import migration classes from the package.
- New `FormDraftResponseDto` / `FormSubmissionResponseDto` carry the swagger
  shapes; entities are decorator-free. See
  [ADR 0034](../decisions/0034-persistence-entities-stay-swagger-free.md).
- Commit `fda3b6b3` on `worktree-dedupe-typeorm-721`.

## Why we did it that way

- **Shims over rewriting 44 imports.** Re-export shims let every importer
  compile unchanged, keeping the diff reviewable. Collapsing the shims is a
  mechanical follow-up, deliberately deferred.
- **The plan missed real drift.** The package's `FormSubmissionEntity` lacked
  `referenceCode` — the entity drift wasn't just decorators. Worth knowing:
  pre-flight verification against the live tree caught it; the plan's
  "verified facts" were three weeks stale.
- **`typeorm-ts-node-commonjs` can't see workspace packages from source.**
  The package's `main: ./src/index.js` only exists post-build, so local
  `migration:*` broke the moment `data-source.ts` imported the package. Fix:
  register `tsconfig-paths` via `NODE_OPTIONS`. Locally it maps to
  `src/index.ts` (ts-node compiles it); in the runner image that `.ts` is
  absent so resolution falls back to the compiled package symlink — same
  behaviour as before. Rejected: changing the package's `main`, which would
  have broken the Docker runner layout where the package dir *is* the dist
  output.
- **Dockerfile manifest list.** `pnpm install --frozen-lockfile` in the image
  needs every workspace manifest in the dependency graph;
  `packages/database/package.json` had to be added or the api image build
  would fail. The runner's package symlinks are generated from `packages/*/`
  (post-#412), so no change needed there.
- **Defensive migration throws from JS, not SQL.** The duplicate pre-check
  SELECT can't abort the transaction, so the smoke spec can exercise the
  failure and the success path in one rolled-back transaction.

## Open questions

- Live environments must be checked for `(form_id, version)` duplicates
  before deploy (`SELECT form_id, version, COUNT(*) FROM form_definitions
  GROUP BY 1, 2 HAVING COUNT(*) > 1;`) — the migration fails loudly on a
  dirty env, but pre-checking avoids a failed deploy.
- One-time manual smoke of the in-image migrate path
  (`docker build --target runner` + `pnpm migration:run`) before the next
  production migrate — the tsconfig-paths fallback is reasoned-sound but
  wasn't exercised in a real image this session.
- Collapsing the api entity shims by rewriting imports to
  `@govtech-bb/database` directly — mechanical follow-up, not scheduled.
