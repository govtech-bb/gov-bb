# DEAD-01 — Delete genuinely-unused source files

## Context

Issue #1409 (a `fallow` + semantic consolidation audit) reported 9 unused
source files across `apps/api`, `apps/chat`, `apps/form_builder`, and
`apps/landing`. The plan (`docs/plans/1409-delete-unused-source-files.md`) had
already narrowed scope, flagging that several of the 9 were false positives
still in use. This session verified the remainder and deleted only the
confirmed-dead.

## What we did

Commit `8213d6a2` removes:

- `apps/api/src/payments/payment.events.ts` + its now-orphaned coverage
  exclusion in `apps/api/vitest.config.ts`.
- `apps/chat/src/components/chat/sources.tsx`.
- `apps/api/src/database/entities/{entity-base,form-component.entity,index}.ts`.

Left untouched (verified live): `form_builder/app/router.tsx`, the two
form_builder `test-mocks/*.js` shims, `landing`'s `bank-holiday-calendar/-meta.ts`,
and the 8 other entity shims in `apps/api/src/database/entities/`.

## Why we did it that way

The load-bearing call was the `apps/api/src/database/entities/` directory. The
plan named a "trio" but the directory holds **11** files — at a glance that
looks like the plan was stale. It wasn't. Every file in there is a thin
re-export shim onto `@govtech-bb/database` (the single source of truth since
#721; `data-source.ts` pulls `entities` from the package). The distinction that
matters:

- **8 shims stay** — `payment.entity`, `form-submission.entity`,
  `form-draft.entity`, `form-config.entity`, etc. are imported *directly by
  path* throughout `apps/api` (repositories, services, specs). Deleting them
  would break those imports even though they're "just" shims.
- **3 shims go** — `entity-base.ts` and `form-component.entity.ts` are
  referenced *only* by the local barrel `index.ts`, and nothing in the tree
  imports the barrel. So the three form a closed dead loop: removing them
  together breaks nothing.

This is exactly what the plan's open question asked to confirm ("the index
re-exports canonical entities, which is what makes the dependency graph look
alive") — and grep confirmed it: zero external importers of the trio, the
migration to `@govtech-bb/database` is complete.

The `payment.events.ts` removal also took its `vitest.config.ts` coverage
exclusion. The plan mislabeled that line a "mock registration"; it's a
coverage-exclusion glob. Same action either way.

## Open questions

None. Build (15 projects), `tsc -b`, and api+chat tests all green post-deletion;
coverage thresholds still hold without the `payment.events.ts` exclusion.
