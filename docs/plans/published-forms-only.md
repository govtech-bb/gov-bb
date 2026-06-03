# Plan: forms list shows only published, non-disabled forms

Resolves [#615](https://github.com/govtech-bb/gov-bb/issues/615).

## Goal

A form that has been disabled ("deleted") in the form builder must stop
appearing on the forms app index and must stop producing a "Start now" button
on the landing site. Citizens should only ever see live, published forms.

## Background / root cause

Traced end to end, the issue is narrower than its title suggests:

- **Unpublished/draft forms already cannot leak.** Production serves the public
  `GET /form-definitions` from committed recipe **files**
  (`RECIPE_SOURCE=files`); the DB path is forced off outside `development` so
  unpublished `form_definitions` rows can't leak (issue #145). So "unpublished"
  is already handled.
- **"Deleted" means "disabled."** In the form-builder picker, a *draft* is
  hard-deleted (never public anyway), but a *live published* form is
  **disabled**, which writes a tombstone to `form_disabled_overrides`.
- The single-form endpoint `GET /form-definitions/:formId` already returns
  **410 Gone** for disabled forms (the controller checks
  `FormDisabledOverridesService.find`). But the **list** endpoint `getAll`
  does **not** consult the tombstone table — its own comment names this as a
  deferred follow-up:

  > `// Known trade-off (PR 3): findAll does not filter disabled forms.`
  > `// ... If filtering is needed later, it's a follow-up issue.`

Both consumers (`apps/forms` index loader and the `apps/landing` manifest
script) render whatever the list returns, so a **single server-side filter on
`getAll` fixes both surfaces with zero client changes.**

## Approach

**Server-side (issue approach #1).** Filter `getAll` against
`form_disabled_overrides` so disabled formIds are excluded from the public list,
matching the 410 behaviour the single-form endpoint already enforces.

The filter goes in the **controller's `getAll`**, which already injects
`FormDisabledOverridesService` and is where the single-form tombstone check
lives — keeping list and single-get behaviour consistent. The service's
`findAll` stays source-agnostic ("all known definitions"); the controller layer
owns "what the public sees."

Alternatives considered:

- **Client-side guards (issue approach #2)** — add a status field to
  `FormDefinitionSummary` and filter in `apps/forms` + the manifest script.
  Rejected: more surface area, a redundant second source of truth, and the
  server fix already covers both consumers.
- **Filter inside `FormDefinitionsService.findAll`** — rejected to keep the
  service free of disabled-state concerns and the tombstone dependency in one
  place (the controller).

## Scope

- Add a method to `FormDisabledOverridesService` to list every disabled formId
  (e.g. `findAllFormIds(): Promise<string[]>`) — it currently only exposes
  `find(formId)`.
- In `FormDefinitionsController.getAll`, fetch the disabled set and exclude
  those formIds from the returned list. Replace the stale "does not filter"
  trade-off comment with a note on the new behaviour.
- No changes to `apps/forms`, `apps/landing`, or `FormDefinitionSummary`.

## Files

- `apps/api/src/forms/form-disabled-overrides/form-disabled-overrides.service.ts`
  — add `findAllFormIds`.
- `apps/api/src/forms/form-definitions/form-definitions.controller.ts`
  — filter `getAll`; update the comment.
- `apps/api/src/forms/form-disabled-overrides/form-disabled-overrides.service.spec.ts`
  — cover `findAllFormIds` (empty + populated).
- `apps/api/src/forms/form-definitions/form-definitions.controller.spec.ts`
  — cover `getAll` excluding tombstoned forms (and the
  short-circuit spec if it asserts the full list shape).

## Verify

- New + existing unit tests pass: `pnpm exec nx run api:test`.
- Full monorepo gate before push (per CLAUDE.md):
  `pnpm exec nx run-many -t build --exclude=landing` and
  `pnpm exec nx run-many -t test`.
- Manual reasoning against the acceptance criteria:
  - A disabled form is absent from `getAll` → absent from the forms index list.
  - The landing manifest is built from `getAll` → no "Start now" button for it.
  - Only non-disabled, file-published forms remain listed.

## Acceptance criteria (from #615)

- [ ] A deleted (disabled) form no longer appears on the forms app index list.
- [ ] A deleted (disabled) form no longer produces a Start now button on landing.
- [ ] Only published forms are listed in either surface.
- [ ] Behaviour is covered by tests (server-side: controller + override service).

> Note: the AC's "manifest script" test is moot under the chosen server-only
> approach — the manifest is correct once the API is, and the script is already
> covered for response-shape handling. Confirmed with the issue author.

## Open questions

None outstanding. Branch creation off `sandbox` and implementation happen in the
follow-up `/bb:dev-start` session, not in this planning session.
