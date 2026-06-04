# Form builder — round-trip processors (data-loss fix) — Implementation Session

**Date:** 2026-05-27
**Branch:** `fix/form-builder-processors-roundtrip` (off `sandbox`, merges back to `sandbox`)
**Issue:** [#255](https://github.com/govtech-bb/gov-bb/issues/255)
**Plan:** `docs/plans/form-builder-processors-roundtrip.md`
**Decision:** [ADR 0013](../decisions/0013-form-builder-round-trip-preserves-unauthored-fields.md)

## Context

Opening an existing form in the builder and clicking Deploy produced recipe JSON
with no `processors` — `deserializeRecipe` never read them and
`serializeRecipeDraft` never wrote them, so processors authored outside the
builder were silently wiped on every re-deploy. This session is #255 "Session 1
of 2": fix the data loss only, no authoring UI.

## What we did

- `packages/form-builder/src/types.ts`: `RecipeDraft` gains
  `processors?: Processor[]` (imported from `@govtech-bb/form-types`).
- `packages/form-builder/src/serialization.ts`: `serializeRecipeDraft` writes
  processors and `deserializeRecipe` reads them, both via the `!== undefined`
  conditional-spread idiom already used for `description`.
- `packages/form-builder/src/serialization.spec.ts` (TDD red→green): renamed the
  now-false "processors are not set in serialize output" test into a thorough
  no-processors-stays-absent guard; added a populated round-trip (email + payment
  + webhook, deep-equal), a `serviceContractRecipeSchema` parse, and an
  explicit-empty-`[]` test. 74 tests (was 71).
- ADR 0013 records the general principle the bug violated.

## Why we did it that way

- **Opaque pass-through, not a model.** The array round-trips byte-for-byte: no
  editor-only id, no transform. The builder has no UI to edit processors this
  session, so giving them structure (an `id` for React keys / edit targeting,
  mirroring `RecipeFieldDraft`) would be speculative. Keeping the array opaque
  makes the change a trivially-verifiable identity round-trip and leaves Session
  2 to add the id when there's UI that needs it.
- **`!== undefined`, not truthiness.** A length/truthiness check would collapse an
  explicit `[]` into "absent" and silently drop it — the same class of data loss
  we're fixing. `!== undefined` keeps "no processors field" distinct from "empty
  processors array". The explicit-`[]` test exists solely to lock this in against
  a future refactor to a truthiness check.
- **Fix at the chokepoints, leave the reducer alone.** Every load path goes
  through `deserializeRecipe` and every deploy through `serializeRecipeDraft`;
  the reducer's `LOAD_DRAFT` does `{ ...action.draft, steps: [...] }`, so
  processors ride through editor state without reducer changes. Verified the
  whole open→edit→deploy path carries them with no extra plumbing.
- **Reused the `description` pattern verbatim.** Same guard, same conditional-spread
  placement — the new code reads as a sibling of the existing optional field,
  not a special case.

## What we almost got wrong

- **Edited the wrong working tree.** Early edits went to the main checkout's
  `serialization.spec.ts` by absolute path instead of the worktree copy — git
  worktrees have independent file trees, so the worktree's tests ran the
  unchanged file and stayed green (71/71) when they should have gone red. Caught
  it via the unchanged test count, moved the change into the worktree, and
  restored the main checkout. Lesson: inside a worktree, address files by the
  worktree path, not the original repo root.
- **Build churn.** `nx run-many -t build` regenerates
  `apps/forms/src/routeTree.gen.ts`; reverted it so the diff is only the three
  intended files (known repo gotcha).

## Verify

- `pnpm exec nx test form-builder` → 74 pass (was 71). RED watched first: the
  populated and schema-parse tests failed on `undefined` processors before the fix.
- `pnpm exec tsc -b packages/form-builder` → clean (CI's separate type-check job).
- `pnpm exec nx run-many -t build --exclude=landing` → 12 projects green.
- Browser smoke (open a form with processors → Deploy → confirm JSON still has
  `processors`) is the user's to run, per house practice.

## Open questions

- **`contactDetails` has the same latent bug** — it's on the recipe schema, has
  no builder UI, and is dropped on round-trip. Out of scope for #255; tracked in
  [#267](https://github.com/govtech-bb/gov-bb/issues/267). `RecipeDraft` + the two
  chokepoints would fix it the same way.
- **Processors authoring UI** is #255 Session 2 (`docs/plans/form-builder-processors-ui.md`),
  which builds on the opaque draft shape established here.
