# Remediation of orphan slash-namespaced generic component refs (#426)

**Issue:** [#426](https://github.com/govtech-bb/gov-bb/issues/426)
**Date:** 2026-05-29
**Branch:** `fix/orphan-slash-refs-426` (off `sandbox`, PR → `sandbox`)

## Problem

Several recipes reference slash-namespaced generic component refs —
`components/generic/table`, `components/generic/signature`,
`components/generic/repeater`, and `components/generic/display` — that have **no
definition anywhere in the repo**. They are not in `BUILTIN_REGISTRY` and nothing
seeds them into the `custom_components` table. Resolution is lazy
(`RegistryService.hydrateForm` at request time), so a missing ref throws
`UnresolvableComponentError` only when the form is requested — not at boot, build,
or in CI. Any environment lacking manually-inserted `custom_components` rows fails
to render these forms.

`recipe-registry-refs.spec.ts` currently allow-lists these orphan refs, so CI does
not catch them.

This is the same class of problem #416 fixed for the 11 migrated `generic/*` refs;
these four were left behind as orphans. `temp-teacher-application-barbados/1.1.0.json`
was already reworked as the worked example of the fix.

## Direction (chosen)

**Remove the orphan refs** by rewriting recipes with supported builtin primitives +
native behaviours (the issue's preferred option), rather than defining the missing
components in the registry/DB.

## Scope

**Latest version of each affected recipe only** (9 files). Old historical versions
are left untouched — they remain requestable by explicit `?version=` but are not
served by default (highest semver wins when unspecified, per
`RecipeFileLoaderService.latestVersion`).

| Recipe | File (latest) | Orphan refs to remove |
|---|---|---|
| barbados-secondary-entrance-exam-choice | 1.1.0.json | signature ×2 |
| cape-exam-registration-2024 | 1.2.0.json | table ×1, signature ×1 |
| csec-private-candidate-registration | 1.2.0.json | table ×1 |
| duties-performed-exam-claim | 1.1.0.json | table ×3 |
| homeschooling-application-2024 | 1.2.0.json | signature ×1, repeater ×2 |
| school-uniform-grant-barbados | 1.1.0.json | signature ×1 |
| statement-of-travelling-form | 1.1.0.json | table ×1, display ×2 |
| term-leave-application | 1.2.0.json | signature ×2 |
| textbook-grant-application | 1.1.0.json | table ×1 |

Explicitly **out of scope**: the older sibling versions cape/csec/homeschooling/
term-leave `1.1.0.json`. (A follow-up issue may address them or prune dead versions.)

## Transformation rules

Derived directly from the `temp-teacher-application-barbados/1.1.0.json` prototype.
Valid target refs are `BUILTIN_REGISTRY` keys (`components/generic-text`,
`components/generic-textarea`, `components/generic-date`, `components/generic-radio`,
`components/generic-file`, `components/confirmation`, `components/date-of-birth`, …).

1. **`generic/table` → native repeatable step.** Each table column becomes an
   individual `components/generic-text` element (use `multiline: true` where the
   column was a long-text/notes column). The containing step gets a `repeatable`
   behaviour `{ "type": "repeatable", "min": N, "max": M }`, with `min`/`max`
   derived from the old table's `rows` config. Mirrors `educational-record` /
   `work-experience` in the prototype and `jobstart-plus-programme` /
   `apply-for-conductor-licence`.
2. **`generic/signature` → `components/generic-text`.** Carry over label/fieldId.
3. **`generic/display` → `components/generic-text`** content element (carry over
   the display content into a text element; mark non-required).
4. **`generic/repeater` → native `repeatable` behaviour** on the step holding the
   repeated elements (same mechanism as rule 1).
5. **Bare `"required": true` → `validations` block.** Replace any element
   `overrides.required: true` (and `required: false`) with:
   ```json
   "validations": {
     "required": { "error": "<Label> is required", "value": true },
     "minLength": { "error": "<Label> must be at least 2 characters", "value": 2 }
   }
   ```
   `minLength` is added only for free-text fields (not dates, radios, files,
   confirmations, or optional fields). Optional fields become
   `"validations": { "required": { "value": false } }`.

Each table/repeater rewrite must be driven by the **actual columns and row counts in
the source file** — the per-file specifics are enumerated in the implementation plan,
not guessed here.

## Test tightening

Update `apps/api/src/forms/form-definitions/recipe-registry-refs.spec.ts`:

- Add a third assertion: **no orphan slash ref** (`components/generic/table`,
  `.../signature`, `.../repeater`, `.../display`, `.../info-box`) appears in the
  **latest-version file of any recipe**. "Latest" = highest semver per recipe dir,
  computed in-test (small semver-max helper, matching the loader's
  `latestVersion`/`compareSemver` semantics).
- Drop the orphan allow-list from the existing comments; document that old
  (non-latest) version files are intentionally exempt because they are not served by
  default.

This catches regressions in served-by-default forms while respecting the latest-only
fix scope.

## Validation

- `pnpm exec nx run-many -t build --exclude=landing` — all packages compile.
- `pnpm exec nx run-many -t test` — all suites pass, including the tightened
  `recipe-registry-refs.spec.ts`.
- Each rewritten recipe still parses against the recipe schema
  (`RecipeFileLoaderService` validates on load — covered by existing loader tests).

## Out of scope / non-goals

- Defining the orphan components in the registry or a `custom_components`
  seed/migration (the rejected alternative).
- Touching non-latest version files.
- Any `custom_components` production-data migration.

## Workspace

Branch `fix/orphan-slash-refs-426` off `sandbox` (the team's integration branch —
259 commits ahead of `dev` and the only branch holding the #426 state). PR targets
`sandbox`. Unrelated uncommitted changes
currently in the working tree (`smart-stream-vendor-registration/1.1.0.json`,
`routeTree.gen.ts`) are stashed before branching so the feature branch contains only
#426 work.
