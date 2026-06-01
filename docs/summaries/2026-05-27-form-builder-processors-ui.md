# Form builder — author submission processors in the UI — Implementation Session

**Date:** 2026-05-27
**Branch:** `feat/form-builder-processors-ui` (off `fix/form-builder-processors-roundtrip`, merges back into it — stacked on Session 1)
**Issue:** [#275](https://github.com/govtech-bb/gov-bb/issues/275) (parent [#255](https://github.com/govtech-bb/gov-bb/issues/255))
**Plan:** `docs/plans/form-builder-processors-ui.md`
**Decision:** [ADR 0014](../decisions/0014-form-builder-processor-config-edits-preserve-unrendered-keys.md)

## Context

Session 1 made the builder carry `processors` losslessly through serialize/
deserialize but with no UI ([ADR 0013](../decisions/0013-form-builder-round-trip-preserves-unauthored-fields.md)).
This session ("Session 2 of 2") adds the authoring UI: a form-level Processors
panel where a builder adds/edits/removes processors instead of hand-editing
recipe JSON. Built on Session 1's branch because PR #268 had not yet merged to
`sandbox`.

## What we did

- **Draft shape (`packages/form-builder`).** Widened `RecipeDraft.processors`
  from `Processor[]` to `RecipeProcessorDraft[]` (`Processor & { id }`), adding
  `AuthorableProcessorType` (= `Processor["type"]` minus `payment`).
  `deserializeRecipe` mints an editor-only id per processor; `serializeRecipeDraft`
  strips it. Round-trip tests made id-aware (minted on the draft, absent on the
  wire). New `processor-defaults.ts` (`makeDefaultProcessor`) seeds a blank
  default per authorable type. 84 package tests (was 76).
- **Reducer.** `ADD_PROCESSOR` / `REMOVE_PROCESSOR` / `UPDATE_PROCESSOR_CONFIG`.
  Add initialises the array; remove is a no-op when absent (keeps the
  absent-vs-`[]` distinction); update **replaces** the config.
- **UI.** New `-processors-editor.tsx` (panel: add-by-type, per-processor cards,
  remove, non-blocking missing-email warning), `-processor-config-form.tsx`
  (type-specific fields), and two reusable primitives `-value-path-picker.tsx`
  (a `stepId.fieldId` dropdown over `resolveFieldIds`) and `-key-value-editor.tsx`.
- **Wiring.** `-step-list.tsx` gains a "Processors (N)" rail entry; `index.tsx`
  gains a `mainView: "step" | "processors"` toggle and a `resolveFieldIds` memo.
  CSS for the panel/cards. 163 app tests (was 154).

## Why we did it that way

- **Payment is read-only, not hidden (scope call, confirmed with the user).** The
  plan listed all five types; we omitted `payment` *authoring* — it's not in the
  add list — but an existing payment processor renders as a read-only, removable
  card rather than vanishing. Hiding it would make the panel's count lie and risk
  a builder being surprised by config they can't see. It still round-trips intact.
- **Config edits replace; forms preserve unrendered keys by spreading (ADR 0014).**
  The first cut had the reducer *merge* the edited config over the old one. That
  preserves the unrendered webhook `secret` for free — but then a key-value editor
  can never *remove* a key (the deleted key survives the merge). Switched to
  replace, and moved secret-preservation into the forms (each spreads `...config`
  before overlaying edits). This is the only design that satisfies both
  removal and secret-survival; it's the edit-path counterpart to ADR 0013.
- **`makeDefaultProcessor` returns a full `{ type, config }`, not just config.**
  Returning the whole discriminated-union member keeps the `type`↔`config`
  correlation, so the reducer can spread an id over it (`{ ...processor, id }`)
  without a cast — TS distributes the spread across the union. A config-only
  helper would have forced casts at the construction site.
- **Path-picker for paths, free-text for the rest (per the plan).** Only the
  dot-path fields (`recipientField`) get a dropdown from the resolved field list;
  the `dynamic()` fields are plain literals — every real recipe uses literals, and
  a `${values…}` expression builder was deferred. The picker keeps a non-matching
  existing value selectable so opening it never silently discards a hand-authored
  path.
- **Validation reuses the existing server Validate flow.** Because serialize now
  emits `processors` and `serviceContractRecipeSchema` already validates them,
  malformed config is caught with no new code. The only added client check is the
  missing-email warning — and it is purely presentational: it does **not** feed
  `canSubmit`, because some forms legitimately have no email.

## What we almost got wrong

- **Merge vs replace for config updates.** See above — caught during a review pass
  before commit: merge silently breaks key removal for the record-shaped
  spreadsheet/opencrvs configs. Re-architected to replace + form-side spread and
  recorded it as ADR 0014.
- **`dynamic()` fields aren't plain strings at the type level.**
  `dynamic(z.string())` infers `string | Record<string, unknown>` (jsonLogic), so
  `recipientField`/`url`/header values aren't `string`. Added an `asText` coercion
  for reads (a non-literal value shows blank rather than crashing, and is only
  overwritten if the author actually edits it).
- **Worktree deps + paths.** The fresh worktree had no `node_modules` (ran
  `pnpm install`), and all edits were addressed by the worktree path — not the
  main checkout — per the Session 1 lesson.

## Verify

- `pnpm exec nx test form-builder` → 84 pass (was 76). RED watched first for the
  id mint, the id strip, and the defaults.
- `pnpm exec nx test form-builder-app` → 163 pass (was 154). RED watched first for
  each reducer action, the two primitives, the editor integration behaviours, and
  the header-prune.
- `pnpm exec nx run-many -t build --exclude=landing` → 12 projects green.
- `pnpm exec tsc -b` → clean (CI's separate type-check job).
- eslint on the changed files → clean.
- Browser smoke (add one of each type → fill via picker → Deploy → reopen and
  confirm everything survived; then edit a form whose JSON has a webhook `secret`
  and confirm it's still present after Deploy) is the user's to run, per house
  practice.

## Open questions

- **`spreadsheet` / `opencrvs` config keys.** Surfaced as a free-form key-value
  editor (matches their arbitrary-`Record` schema). Confirm that matches how the
  runtime consumers expect them keyed, vs a fixed key set we should template.
- **Missing-email warning placement.** Currently in the Processors panel only;
  could also sit near Deploy. Cosmetic.
