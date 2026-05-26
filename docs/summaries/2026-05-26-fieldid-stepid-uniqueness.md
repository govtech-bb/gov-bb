# Form builder — fieldId/stepId uniqueness — Implementation Session

**Date:** 2026-05-26
**Branch:** `feat/fieldid-stepid-uniqueness` (stacked on `feat/field-id-kebab-validation`)
**Issue:** [#206](https://github.com/govtech-bb/gov-bb/issues/206) — form_builder: validate fieldId/stepId uniqueness within a recipe (follow-up to [#201](https://github.com/govtech-bb/gov-bb/issues/201))
**Plan:** `docs/plans/fieldid-stepid-uniqueness.md`

## Context

#201 added kebab-case *format* validation for ids but explicitly deferred *uniqueness*. #206 closes that: within one recipe, no two fields may resolve to the same data `fieldId` and no two steps may share a `stepId`. Collisions silently break downstream field/step references (validation rules, behaviours, the forms renderer), and the most common collision needs no typing at all — dropping two Text fields both resolve to the default id `text`.

The key design constraint the plan identified: uniqueness must be checked on the **resolved effective id** (`overrides.fieldId ?? primitive.fieldId`, plus block children via `childOverrides`), **recipe-wide** — form submission data is one flat object keyed by `fieldId` across all steps, so an id must be unique across the entire form, not per step. A check that only inspected the typed override (the way #201 handled format) would miss the dominant blank-override collision.

## What we did

**One detector, consumed three ways.** TDD throughout — the pure detector was built by a subagent under strict red/green, then reviewed.

- `packages/form-builder/src/duplicate-ids.ts` (+ `duplicate-ids.spec.ts`, 22 tests): `resolveFieldIds`, `findDuplicateFieldIds`, `findDuplicateStepIds`, `findRecipeIdCollisions`, and `fieldIdDuplicatesAnother` (for inline self-excluding checks). Resolves component/custom defaults via the catalog primitive, expands blocks to one id per child, skips unknown refs and missing defaults defensively (#208). Exported from `index.ts`.
- `index.tsx`: a live `useMemo(findRecipeIdCollisions, [draft, catalog])`, with `!hasIdCollisions` folded into `canSubmit` so it gates **both** Save draft and Deploy. An always-on banner renders whenever the live detector finds collisions (so the no-typing default-collision case is visible without clicking Validate), and `handleValidate` gained a pre-flight that injects collisions as `ValidationIssue`s — same pattern as the existing empty-step pre-flight.
- `-step-editor.tsx`: step-id uniqueness inline error after the existing kebab format check.
- `-field-edit-panel.tsx`: inline duplicate warning on the top-level Field ID Override, threading `fieldIdDuplicatesAnother(draft, catalog, field.id, candidate)` so it excludes the field being edited.

## Decisions / notes

- **Live derived gate, not just on-Validate.** `validateResult` is *not* reset when the draft is edited, so a stale-green result would otherwise leave the buttons enabled after a duplicate is introduced. Doing the collision check as a live `useMemo` and folding it into `canSubmit` is what makes the gate trustworthy. This was the explicit reason the plan rejected an inline-only approach.

- **Override is local state, committed on Save.** In `-field-edit-panel.tsx` the override is held in component-local state and only dispatched to the draft on the panel's *Save*. So the recipe-wide banner/gate reflect committed edits, while the inline warning gives live in-edit feedback. The plan's wording implied the override was live-patched to the draft; it isn't — the inline+banner split is what covers both moments.

- **Block-child inline feedback deferred** (per plan) to the recipe-wide banner/gate. Each block child edits against uncommitted `childOverrides` local state; threading per-child inline checks is materially more plumbing for a case the banner already covers.

- **Branch stacking.** The plan builds directly on #201's `-id-validation.ts` module and the Field-ID-Override format validation in `-field-edit-panel.tsx`, neither of which is in `sandbox` yet (#201 is open as PR #209 → sandbox). So this branch was based on `feat/field-id-kebab-validation` rather than `sandbox`, and rebased onto its tip to absorb the #201 session-summary commit.

## Verify

- `pnpm exec nx run-many -t build --exclude landing` → 12 projects green (landing excluded; its prebuild needs network).
- `pnpm exec nx run-many -t test` → 11 projects green (form-builder 61, form-builder-app 108).
- Manual browser smoke deferred to the user — per standing preference (real-browser smoke over automated drivers).

## Out of scope (called out by the plan, still out)

- **Server-side / API backstop** — [#207](https://github.com/govtech-bb/gov-bb/issues/207). `validateFormContract` is a pure Zod parse with no catalog, so it can't resolve defaults; a shared detector wired into `/builder/registry/validate` would backstop AI output + ingest.
- **Custom component default id** — [#208](https://github.com/govtech-bb/gov-bb/issues/208). The detector reads a component's default via the catalog primitive and handles a missing default defensively (contributes no id).
- **Block-child inline feedback** — deferred to the banner/gate.
- The pre-existing title `onBlur` stepId auto-derive path can produce a duplicate stepId without the new inline check (caught by the recipe-wide banner/gate); not introduced here.
