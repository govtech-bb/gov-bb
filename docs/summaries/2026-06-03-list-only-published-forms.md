# Forms list shows only published, non-disabled forms (#615)

Date: 2026-06-03
Issue: [#615](https://github.com/govtech-bb/gov-bb/issues/615)
Branch: `fix/615-list-only-published-forms` → `sandbox`
Plan: [docs/plans/published-forms-only.md](../plans/published-forms-only.md)

## Why this work happened

#615 reported that the forms landing showed "deleted/unpublished" forms — they
appeared on the `apps/forms` index and produced "Start now" buttons on
`apps/landing`. Both surfaces are driven by the public
`GET /form-definitions` list endpoint in `apps/api`.

## What the investigation reframed

The issue's framing ("deleted/unpublished") turned out narrower once traced end
to end:

- **Unpublished/draft forms already cannot leak in production.** The public API
  serves recipes from committed **files** (`RECIPE_SOURCE=files`); the DB path
  is forced off outside `development` precisely so unpublished `form_definitions`
  rows never reach end users (issue #145). So "unpublished" was already handled.
- **"Deleted" really means "disabled."** In the form-builder picker a *draft* is
  hard-deleted (never public anyway), but a *live published* form is
  **disabled**, which writes a tombstone row to `form_disabled_overrides`.
- The single-form `GET /form-definitions/:formId` already returns **410 Gone**
  for tombstoned forms. But the **list** endpoint `getAll` did not consult the
  tombstone table — its own comment named this as a deferred follow-up
  ("Known trade-off (PR 3): findAll does not filter disabled forms"). This issue
  *was* that follow-up.

Because both consumers just render whatever the list returns, a single
server-side filter fixes both with zero client changes (issue approach #1). The
alternative — adding a status field to `FormDefinitionSummary` and filtering in
`apps/forms` + the landing manifest script (approach #2) — was rejected: more
surface area and a redundant second source of truth.

## What changed (all in `apps/api`)

- `form-disabled-overrides.service.ts` — new `findAllFormIds()` returns the
  formId of every tombstoned row (the service previously only exposed
  `find(formId)`). Uses `repo.find({ select: { formId: true } })` to fetch just
  the column needed.
- `form-definitions.controller.ts` — `getAll` now fetches the definition list
  and the disabled set in parallel (`Promise.all`) and filters disabled formIds
  out before responding. The stale trade-off comment was replaced with one
  explaining the new behaviour and its parity with the single-form 410.

**Why the filter lives in the controller, not the service:** the controller
already injects `FormDisabledOverridesService` and is where the single-form
tombstone check lives, so list and single-get behaviour stay consistent in one
place. `FormDefinitionsService.findAll` stays source-agnostic ("all known
definitions"); the controller owns "what the public sees."

## Test adjustments worth noting

`form-definitions.controller.short-circuit.spec.ts` has a "does NOT short-circuit
findAll" test asserting the per-form 410 path (`find`) doesn't gate the list.
That assertion still holds, but `getAll` now calls the new `findAllFormIds`, so
the mock service needed that method stubbed (`mockResolvedValue([])`) or `getAll`
would throw on `new Set(undefined)`.

## Verification

- TDD: specs written first (override-service `findAllFormIds` empty/populated;
  controller "excludes disabled forms"), then implemented to green.
- `nx run api:test`: **639/639 pass**, including the 3 new tests; `api` compiles
  cleanly.
- Full gate (`build --exclude=landing`, `run-many -t test`) surfaced failures
  only in `chat`, `form-builder-app`, and `ai-bedrock` — all pre-existing
  (builds fail on missing local deps `@tanstack/react-virtual` / `@dnd-kit/core`;
  the test failures reproduce with this branch's changes stashed). None depend on
  `apps/api`; CI with a full install builds them.
