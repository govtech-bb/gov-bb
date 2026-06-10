# 0046 — Save Changes overwrites in place; Deploy is the only path that cuts a version

**Date:** 2026-06-10
**Status:** Accepted

## Context

The form builder has two ways to persist a recipe, and they had drifted into an
unintended overlap:

- **Save Changes** (the `SubmitModal`, reached via *Save draft*) routes to
  `updateRecipe` (PUT, overwrite the loaded row) only when
  `submitVersion === currentVersion`; otherwise it falls through to
  `submitRecipe` (POST, create a new draft row).
- **Deploy** (the separate `PublishModal`) cuts a new minor and publishes it.

The save-path default version was computed as `bumpPatch(currentVersion)`, so the
Save Changes modal always opened pre-bumped (`2.0.0` → `2.0.1`). That made
`submitVersion === currentVersion` permanently false, so **every** Save Changes
created a new draft row at a fresh patch — wasting version numbers and leaving the
backend with duplicate drafts the user never asked for (issue #329). The
`updateRecipe`/PUT branch was effectively dead code.

Two product semantics could have resolved it:

- **Keep bumping, track a separate `pristineVersion`** and route the PUT off that.
  Rejected: more state, and it still mints a patch row on every save — it doesn't
  answer "what should Save Changes *mean*", it just renames the duplicate.
- **Make Save Changes mean overwrite-in-place.** Chosen.

## Decision

**Save Changes overwrites the loaded draft in place at its current version.
Deploy is the only path that cuts a new version.**

1. The Save Changes modal **defaults to the loaded version**
   (`saveDraftVersion = currentVersion ?? "1.0.0"`), so a re-save satisfies
   `isInPlaceUpdate` and routes to `updateRecipe` (PUT). Repeated saves keep
   overwriting the same row.
2. The modal's **version field is read-only on the update path** (`readOnly={isUpdate}`),
   with a hint that Save Changes overwrites in place and Deploy cuts a new version.
   There is **no fork-a-new-version escape hatch** from Save Changes.
3. A **brand-new form** (no `currentVersion`) starts at `1.0.0` and keeps an
   editable version picker — the author still names the initial version on first
   create (POST via `submitRecipe`).
4. **Deploy** (`bumpMinor`) is unchanged and remains the sole way to mint a new
   version.

## Consequences

- A future request to "let me Save as a new version from the builder" must not be
  met by re-enabling the editable version field on Save Changes — point at this
  record. The correct path is Deploy (or a deliberate, separately-decided
  fork-draft feature).
- The frontend↔API save contract is now: Save Changes ⇒ PUT to the loaded
  `formId` at the loaded version; the only POST/create from the builder is a
  genuinely new form. The Open-picker upsert logic and `isPublished` tie-break
  rely on this split.
- `bumpPatch` is no longer used on the save path, but the import stays — the
  apply-AI-changes handler still bumps the working `version` on edit.
