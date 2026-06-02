# Plan — Round-trip processors through the Form Builder (data-loss fix)

Tracking issue: [#255](https://github.com/govtech-bb/gov-bb/issues/255)

> **Session 1 of 2.** This plan fixes the active data-loss bug only — it carries
> `processors` through the builder's serialize/deserialize unchanged, with **no
> UI**. The authoring UI is [Session 2](./form-builder-processors-ui.md), which
> builds on the draft shape established here.

## Goal

Stop the builder from silently wiping a form's `processors` on re-deploy.

Today, opening an existing form in the builder and clicking **Deploy** produces a
recipe JSON with **no `processors`** — because `deserializeRecipe` never reads
them and `serializeRecipeDraft` never writes them. Any processors added
externally (hand-edited recipe JSON, SQL backfill) are erased. After this change,
processors authored anywhere survive an open → deploy cycle untouched.

## Approach

**Chosen: carry `processors` as plain `Processor[]` on `RecipeDraft`,** read in
`deserializeRecipe`, written in `serializeRecipeDraft`. No editor-only id, no
transformation — the array round-trips byte-for-byte. This is the smallest change
that kills the bug and is independently shippable.

`deserializeRecipe` is the **single chokepoint** every load path goes through —
the Open picker (`FormPicker` → `buildLoadArgs`) and the open-from-AI handoff
(`index.tsx`'s `?formId=` effect) both deserialize. Fixing it there fixes all of
them at once. Likewise `serializeRecipeDraft` is the single serialize chokepoint
(Validate, Preview, Submit, Deploy all call it).

The reducer needs **no changes**: `LOAD_DRAFT` spreads `...action.draft`, so
`processors` ride through a load automatically; `RESET`/`EMPTY_DRAFT` simply leave
them `undefined`.

**Deferred deliberately (owned by Session 2):** an editor-only `id` per processor
(for React keys / edit targeting). Session 2 will mirror `RecipeFieldDraft.id` —
minted on deserialize, stripped on serialize — and update the round-trip test to
ignore it. We do **not** add it now because there's no UI to need it, and keeping
the array opaque makes this change a trivially-verifiable identity round-trip.

**Not minting a persisted `id`** (issue #95) — that's a `processorSchema` change
in `form-types` and is out of scope here per the planning decision.

## Scope

### `packages/form-builder/src/types.ts`

- Import `Processor` from `@govtech-bb/form-types`.
- Add an optional field to `RecipeDraft`:
  ```ts
  processors?: Processor[];
  ```

### `packages/form-builder/src/serialization.ts`

- **`serializeRecipeDraft`** — replace the line-71 comment
  (`// processors are managed outside the builder … never set here`) with a
  conditional spread that writes processors when present, mirroring the existing
  optional-`description` handling:
  ```ts
  ...(draft.processors !== undefined ? { processors: draft.processors } : {}),
  ```
  Using `!== undefined` (not a truthiness/length check) preserves the
  distinction between "no processors field" and an explicit empty `[]`, so the
  round-trip is exact.
- **`deserializeRecipe`** — add the symmetric read to the returned draft:
  ```ts
  ...(recipe.processors !== undefined ? { processors: recipe.processors } : {}),
  ```

### `packages/form-builder/src/serialization.spec.ts` (exists)

- Add a round-trip test group:
  - A recipe carrying a representative `processors` array (at least `email`,
    `payment`, and `webhook` — the three with the richest config) →
    `deserializeRecipe` → `serializeRecipeDraft` → the resulting `processors`
    **deep-equals** the original.
  - A recipe with **no** `processors` field round-trips to a draft/recipe that
    still has no `processors` (assert the key is absent — guards against a
    spurious `processors: []` or `processors: undefined` creeping into the
    deployed JSON).
  - The full serialized recipe parses cleanly through
    `serviceContractRecipeSchema` (processors included) — this is the issue's
    acceptance criterion "round-trips through `serviceContractRecipeSchema`".

## Files

| File | Change |
| --- | --- |
| `packages/form-builder/src/types.ts` | add `processors?: Processor[]` to `RecipeDraft`; import `Processor` |
| `packages/form-builder/src/serialization.ts` | write processors in serialize; read them in deserialize |
| `packages/form-builder/src/serialization.spec.ts` | add lossless round-trip + no-processors + schema-parse tests |

## Verify

- `pnpm exec nx test form-builder` — new round-trip tests pass.
- `pnpm exec nx run-many -t build --exclude=landing` then let CI build `landing`.
- `pnpm exec tsc -b` — the package is a strict `@nx/js:tsc` project; CI runs a
  separate type-check job, so confirm types locally (nx build is Vite/jest and
  won't catch a `tsc -b` error).
- Manual confirmation (in a real browser, per house practice): open a form that
  has processors in its deployed JSON, Deploy from the builder, and confirm the
  resulting recipe JSON still contains the `processors` array.

## Acceptance criteria covered (of #255)

- [x] `RecipeDraft` carries `processors`; serialize writes them and deserialize
      reads them (round-trip preserved; covered by a `form-builder` unit test).
- [x] Deployed recipe JSON contains the authored `processors` array and
      round-trips through `serviceContractRecipeSchema`.
- [x] Existing forms opened in the builder retain their processors on re-deploy.

The remaining criteria (authoring UI, builder-side validation surfacing) are
[Session 2](./form-builder-processors-ui.md).

## Open questions

None. The one design choice — exact `!== undefined` round-trip vs collapsing
absent/empty — is settled above in favour of exactness.
