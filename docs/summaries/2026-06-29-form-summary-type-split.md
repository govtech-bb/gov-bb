# Split `FormDefinitionSummary` into `PublicFormSummary` + `BuilderFormSummary`

**Date:** 2026-06-29
**Branch:** `worktree-form-summary-type-split-1403` → merges into `sandbox`
**Issue:** [#1403](https://github.com/govtech-bb/gov-bb/issues/1403) (ARCH-01) — one name for two incompatible types

## What

Added two named contracts to `@govtech-bb/form-types`
(`packages/form-types/src/form-summary.type.ts`) and rewired every call site:

- `PublicFormSummary` `{ formId; title; version; category? }` — apps/api's public
  `/form-definitions` index. Now typed in `form-definitions.service.ts`,
  `recipe-file-loader.service.ts`, and the controller; consumed by apps/forms and,
  as a `Pick<…, "formId"|"title"|"version">` subset, by form_builder_api's
  `PublishedForm` and form_builder's `/builder/forms/published` call.
- `BuilderFormSummary` `{ id; formId; title; version; isPublished; publishedVersion?;
  isDisabled? }` — the authoring `/builder/forms` index. Produced by
  form_builder_api's list handler, consumed across ~15 form_builder files.

The name `FormDefinitionSummary` is gone repo-wide. No runtime logic moved.

## Why

`FormDefinitionSummary` was **one name for four divergent shapes**: a local
interface in apps/forms (no `version`), a different local interface in
apps/form_builder, an anonymous inline shape in apps/api, and `PublishedForm` in
form_builder_api. The identical name invited the assumption that the two list
endpoints were one contract when they are mutually incompatible — and the
apps/forms copy **silently dropped the `version`** apps/api returns, with no
compile-time link to catch it.

- **Two names, not one documented type.** The rejected alternative was keeping the
  shared name and documenting the difference — but the shared name *is* the bug.
  Distinct, audience-scoped names (`Public*` vs `Builder*`) make the two endpoints
  impossible to confuse and let `tsc` link producer to consumer.
- **Re-export, don't rename the import paths.** apps/forms (`@forms/types` barrel)
  and apps/form_builder (`../types/index`) both have many import sites. Rather than
  repoint them all at `@govtech-bb/form-types`, the barrels now re-export the
  canonical type, so existing import paths keep working and the type is still
  single-sourced. (`responses.type.ts` imports the type locally *and* re-exports it
  — a bare `export type { X } from "…"` re-export does not put `X` in local scope,
  which `tsc -b` caught when `FormDefinitionsListResponse` referenced it.)
- **Unified one shape beyond the plan's four.** form_builder's inline
  `/builder/forms/published` consumer shape was the same public-index subset as
  `PublishedForm`, so it was folded onto `Pick<PublicFormSummary, …>` too —
  confirmed with the user.
- **No ADR.** This reinforces the existing single-sourcing precedent (MdaContact,
  #1397) rather than setting a new principle, so the convention lives in this
  summary instead of a decision record (user's call).

## Notes

- **`version` honesty in form_builder_api.** The `/builder/forms` producer
  (`forms.ts`) types `version: r.version` (straight from SQL) as the required
  `string`, which is marginally optimistic — but byte-identical to the pre-change
  expression, and rows survive the `ORDER BY string_to_array(version,'.')::int[]`
  aggregation that would itself reject a null/non-numeric version. apps/api's DB
  and file loaders already coerce `entity.version ?? ""` / `recipe.version ?? ""`,
  so `PublicFormSummary.version` is honestly populated there.
- **form-types coverage gate.** The new file is types-only (zero runtime code), so
  it needs no spec — `form-types:test` stayed at 100% branches (70/70).
- **#1499 overlap is moot.** The plan flagged a `forms.ts` conflict with #1499, but
  #1499 has no open/merged PR yet (only an untracked local plan), so nothing to
  rebase.
- Verified: `nx run-many -t build --exclude=landing,cms` (16 projects green),
  `tsc -b` clean (incl. specs), and tests for form-types / api / forms /
  form-builder-app / form-builder-api all pass. Lint is pre-existing-red on these
  projects; the gate is build + tests.

## Open questions

None.
