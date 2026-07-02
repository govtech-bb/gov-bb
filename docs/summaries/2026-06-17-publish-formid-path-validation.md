# Validate formId/version in the form-builder publish path (#293)

## Context

`apps/form_builder/app/server/publish.ts` interpolates a user-supplied `formId`
and `version` straight into GitHub file paths and branch names. The `recipe`
enters `publishRecipe` as `z.unknown()` cast to `ServiceContractRecipe` (no
format check), and `eraseRecipe` / `getNextDeployVersion` took
`formId: z.string().min(1)`. A crafted value like
`../../../.github/workflows/evil` could construct a path outside the recipes
folder. A May 2026 backend audit flagged it. Worked from
`docs/plans/293-publish-formid-path-validation.md`.

## What we did

- Exported `kebabIdSchema` from `@govtech-bb/form-types` (it existed but wasn't
  exported — now parity with the already-exported `semverSchema`).
- `publishRecipe`: added a local guard right after the cast — reject unless
  `formId` matches `KEBAB_ID_PATTERN` and `version` matches `SEMVER_PATTERN`,
  before the remote `/validate` call, the DB reservation, the branch, or any
  path work.
- `eraseRecipe` / `getNextDeployVersion`: tightened the `inputValidator`
  `formId` from `z.string().min(1)` to `kebabIdSchema`, **and** added a
  handler-level re-check (a direct in-process call bypasses the
  `inputValidator` — same reasoning as erase's existing `reason` re-check).
- Defense-in-depth: `encodeURIComponent` the `formId`/`version` segments at the
  GitHub path sinks (`recipePath` in publish, the erase tree path). Structural
  slashes are preserved; a no-op for valid input.
- Added a `#293` describe block to `publish.spec.ts`: a traversal `formId` and a
  non-semver `version` are rejected with **zero** GitHub/API calls, across all
  three functions.

## Why we did it that way

- **Local check, not just the remote `/validate` call.** `/validate` is a
  network call that resolves refs, not id format; a security gate on a path sink
  must be local and independent (the issue's explicit point #2).
- **Mirror the hardened twin, don't reinvent.** `apps/form_builder_api/src/routes/publish.ts`
  already validates (via schema) + `encodeURIComponent`s; this brings
  `form_builder` to the same shape using the shared form-types patterns.
- **All three functions, not just `publishRecipe`.** Same root cause, same file;
  `eraseRecipe` is the most destructive, so leaving it unguarded made no sense.
- **Did not wire the full `serviceContractRecipeSchema.parse` into the publish
  input.** That's a deliberately-scoped companion issue (legacy-recipe leniency,
  wider surface). The local kebab/semver check is the defense-in-depth #293 asks
  for.
- **Not reachable via the normal UI** — the builder already constrains `formId`
  client-side and shows it read-only at publish. This is a server-side backstop
  for a forged/bypassed request, so the automated tests (not UI clicks) are the
  authoritative proof.

## Verification

- `publish.spec.ts` 31 passed (4 new); the existing happy-path/path assertions
  still pass, confirming `encodeURIComponent` is a no-op for valid input.
- `form-types` 385 passed; `form-types` and `form-builder-app` both build clean.

## Follow-up

- Open question (not blocking): confirm `apps/form_builder` is still an active
  deploy surface vs the `form_builder_api` twin. The fix is correct either way.
- Companion issue: wire `serviceContractRecipeSchema.parse` into the publish
  input for full schema enforcement.
