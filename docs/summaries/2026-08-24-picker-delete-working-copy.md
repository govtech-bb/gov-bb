# Session summary — deleting a published form's builder working copy

**Date:** 2026-08-24 · **Branch:** `2411-picker-reset-to-committed` (off `main`
at `0e54e9d6`) · Issue
[#2411](https://github.com/govtech-bb/gov-bb/issues/2411)

## Context

Hand-edit a recipe in this repo, merge it to `main`, then open that form in the
form builder: you still see the old version, and no UI action fixes it.

The cause is a shadowing `form_definitions` row. Both builder read paths prefer
it unconditionally — `resolveStoredRecipe`
(`apps/form_builder/app/server/forms.ts:117`) falls back to the committed file
only when no row exists, and `listForms` merges the same way. Neither ever
reconciles the row against the file.

## What we did

Seven files, +225/−12, of which 144 lines are tests:

- `hasDraftRow` on `BuilderFormSummary`, set by the `listForms` merge.
- The existing Delete action rendered in the picker's published branch when a
  row exists, labelled "Delete working copy".
- `DeleteModal` takes published-case copy behind an `isPublished` prop.

No new endpoints. `apps/api` and `apps/form_builder_api` are untouched.

## Why we did it that way

**The action already existed.** `deleteForm` → `DELETE /builder/forms/:formId`
(`apps/form_builder_api/src/routes/forms.ts:915`) removes every
`form_definitions` row for a formId, writes no tombstone, and never touches
`form_config` or submissions. It was gated to *non-published* forms — the one
case where clearing the row doesn't matter. Ungating it there is the feature.

**Deleting the row cannot unpublish anything.** `apps/api` forces
`RECIPE_SOURCE=files` outside development
(`form-definitions.service.ts:66-83`), so DB rows never serve the public. The
published artifact is the committed file, which is also why no tombstone is
needed and why the form stays in the picker afterwards.

**No-row is the intended steady state, not an edge case.** It is what
`archive-merged-drafts` produces on every merge; `updateFormHandler` has an
explicit `needsSeed` branch for it and `resolveStoredRecipe` an explicit
fallback. This matters because it is the fact that makes delete safe, and the
fact we initially got wrong (below).

**A distinct label rather than a bare Delete.** #576 filed the red Delete beside
live published services as a data-loss hazard, and `-delete-modal.tsx` said the
action "only ever applies to unpublished drafts". Reusing the same handler with
a label naming what it removes keeps #576 fixed without a second code path.

**Gated on `hasDraftRow`, not always-visible.** With no row there is nothing to
delete and the endpoint 404s, so an ungated button would be dead on most
published rows. The flag is nearly free: `listForms` already computes `draftIds`
for `isOrphanOverride`, then loses the distinction when `isPublished` is OR'd
back over the merged row.

## What we almost got wrong

The first implementation was a "reset to committed recipe" action backed by two
new endpoints — a raw-recipe read on `apps/api` and a reset endpoint on
`form_builder_api` to call it — roughly 620 insertions across two services, plus
a feature inert on sandbox until #2351 sets `RECIPE_PREVIEW_TOKEN`. It was
committed, green, and entirely unnecessary. The user's response — that the
delete button already existed and only needed unhiding — was correct.

Two things went wrong, both worth remembering:

**A claim that ruled out the simpler option went unchecked.** The plan argued
that deleting the row "changes behaviour for anything that assumes a row". That
is false, and one grep for the no-row path would have shown it. The other
argument — that "row equals file" is a more checkable end state than "row is
gone" — is aesthetic, not technical.

**A cost estimate moved an order of magnitude and the decision it justified was
not re-opened.** Reset was chosen when it looked marginally more expensive. The
hydration problem — that nothing `apps/api` serves over HTTP is an un-hydrated
recipe, because `GET /form-definitions/:formId` returns a `ServiceContract` with
the registry inlined and `form_config` processors merged in — was discovered
*after* that choice. The right move was to go back and say the option now costs
ten times what it did when you picked it. Instead the constraint was engineered
around and a section written to justify the result.

Worth noting the simple path is also *more accurate*: after a delete the builder
resolves through `getPublishedRecipe`, which reads the GitHub Contents API on the
default branch (`main`) as of now. The reset endpoint would have read the recipe
baked into the last-deployed API image.

## Open questions

**The automation that should prevent this has never worked.**
`.github/workflows/archive-merged-drafts.yml` calls the same
`formDefRepo.delete({ formId })` on every push to `main` touching a recipe,
precisely so a merged recipe drops its stale row. It has failed on all 48 runs
since its trigger was repaired on 2026-08-10 (#2184/#2209) with `API_URL is not
set` — `ARCHIVE_DRAFTS_API_URL` is absent from `gh secret list`, while
`ARCHIVE_DRAFTS_TOKEN` exists. So no row has ever been archived by the pipeline,
which is why rows go stale at all. Out of scope here and unfiled; it is a
one-secret fix. The manual action is still wanted afterwards — automation cannot
cover a cross-person race where someone edits in the builder while a recipe is
hand-edited in the repo (#2409).

**End-to-end verification is pending.** Unit-tested only; the sandbox check
(hand-edit → merge → confirm stale → delete working copy → reopen) has not run.
