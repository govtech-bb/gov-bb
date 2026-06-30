# Validate the draft recipe blob on every `/builder/forms` write

**Date:** 2026-06-29
**Branch:** `worktree-draft-recipe-validation-1499` → merges into `sandbox`
**Issue:** [#1499](https://github.com/govtech-bb/gov-bb/issues/1499) — draft recipe save skips full `serviceContractRecipeSchema` validation

## What

The three `/builder/forms` write handlers in
`apps/form_builder_api/src/routes/forms.ts` — `createFormHandler`,
`updateFormHandler`, `rekeyFormHandler` — now structurally validate the recipe
blob before persisting it to `form_definitions.schema`:

- **`@govtech-bb/form-types`**: added `draftRecipeSchema` (+ `DraftRecipe`
  type), a lenient extension of `serviceContractRecipeSchema` with
  `createdAt`/`updatedAt` relaxed to optional (`version` was already optional).
  Exported from the barrel. 12 branch-covering specs added.
- **`forms.ts`**: a `parseDraftRecipe(recipe, res)` helper that `safeParse`s
  against `draftRecipeSchema`, sends a 400 with formatted Zod issues on failure,
  and otherwise returns the **unmodified** recipe. Called as the first statement
  in all three handlers, ahead of every DB access. The now-redundant
  `if (!recipe?.formId)` 400 checks in create/rekey were removed (the guard
  subsumes them).
- New handler spec `forms.draft-validation.spec.ts` proving the guard fires
  before any DB write in each handler (malformed → 400 *and* `getDataSource`
  never called), plus missing-formId → 400 and a valid lenient draft →
  success for all three.

## Why

Draft rows aren't served to citizens, and the production publish path
(`/builder/publish`) already runs `validateRecipeFully`. So this is
defense-in-depth — the draft `schema` blob was the one write surface that hit
the DB after only a presence-style `recipe?.formId` truthiness check.

- **Lenient, not the full publish gate.** The rejected alternative was reusing
  `validateRecipeFully` / `serviceContractRecipeSchema` directly. Both require
  `createdAt`/`updatedAt`, and `validateRecipeFully` also runs the #771
  repeatable-bounds layer — either would reject a legitimate mid-edit draft.
  The guiding principle: **the draft-save gate must never be stricter than the
  publish backstop.** A future change that tightens it to the full schema would
  be a regression, not a hardening. (Proposed an ADR for this; user opted to let
  the code comments carry it.)
- **Persist the original recipe, not Zod's parsed copy.** `parseDraftRecipe`
  returns the caller's recipe untouched on success. Returning `parsed.data`
  would silently inject schema `.default()` values into the stored blob —
  `processorSchema` defaults (`method:"POST"`, `timeoutMs:10000`,
  `excludeSteps:[]`), and `recipeMetaSchema`'s `visibility:"public"` — rewriting
  data the caller never sent. The guard's job is to *reject* malformed input,
  not to *normalize* valid input.
- **`steps` stays required, by design.** The issue's own example of
  "structurally invalid" is `steps` of the wrong type, so leniency is scoped to
  the three metadata fields only. Every real producer (`serializeRecipeDraft`,
  used by the builder save path, the AI sidebar, and rekey) always stamps
  `steps` + both timestamps, so no legitimate save is affected.

## Notes

- **Fixture churn was the bulk of the test diff.** Because `steps` is required,
  four existing handler specs whose `recipe()` helpers omitted it
  (`forms.config`, `forms.presence`, `forms.rekey`, `forms.uniqueness`) would
  have started 400-ing; each got `steps: []` added. The plan named three of the
  four — `forms.presence.spec.ts` was the miss.
- **ADR 0010 is misattributed in the issue/plan.** Both cite "ADR 0010 — raw
  drafts may lack createdAt/updatedAt/version", but ADR 0010 is about fieldId
  uniqueness. The substantive justification (real drafts stamp timestamps via
  `serializeRecipeDraft`) is sound regardless, so the code comments describe the
  mechanism rather than citing the wrong ADR.
- **#1403 sequencing is moot.** The plan flagged a `forms.ts` overlap with
  #1403; #1403 merged earlier the same day, so this was built on top of it (the
  worktree's `forms.ts` already carries its `PublicFormSummary`/
  `BuilderFormSummary` imports).
- **Pre-existing dead code, left alone.** `serviceContractRecipeSchema` is
  imported into `forms.ts` but unused (only the `ServiceContractRecipe` type is),
  and the `recipe.title ?? ""` fallbacks are now unreachable post-validation.
  Both pre-date this change and were left per the surgical-changes rule.
- **`parseDraftRecipe` return cast.** It returns `recipe as
  ServiceContractRecipe` though the draft schema makes timestamps optional — a
  slight type over-assertion with no runtime impact (handlers only read
  `.formId`/`.title`, both guaranteed present). Left as-is.
- Verified: `nx run-many -t build --exclude=landing` (16 projects green),
  `tsc -b` clean (incl. specs), `form-types:test` (431 pass, 100% branches /
  98% gate), `form-builder-api:test` (239 pass). Lint is pre-existing-red on
  these projects; the gate is build + tests.

## Open questions

None.
