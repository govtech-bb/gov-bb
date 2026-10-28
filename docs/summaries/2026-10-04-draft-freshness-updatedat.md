# Builder draft freshness: one branch, `updatedAt` first, stamps on every write

2026-10-04 · Form Builder · #2899, #2897, #2878, #2900 item 1 · amends ADR 0075

## Context

#2489 (ADR 0075) re-syncs a stale builder draft row with the committed recipe
when a form is opened, deciding "stale" by the recipe file's git commit date.
The #2893 review found four follow-ups:
- `dev` was still the default base branch.
- The re-sync read the repo default branch while the Deploy guard read
  `PUBLISH_BASE_BRANCH`.
- First service adoption skipped the re-sync.
- Opening a form read the committed recipe twice.

#2878 asked for freshness that doesn't depend on git, because recipe storage may
move off git (govtech-bb/projects#918).

## What we did

- `resolveBaseBranch()` moved to `github-repo.ts` and defaults to `main`. Every
  GitHub recipe read passes it (`ref=` for Contents, `sha=` for Commits).
- `resolveCurrentRecipe` is the one re-sync entry point, used by `getRecipe` and
  `loadServiceSource`.
- Freshness uses the committed recipe's `updatedAt`, falling back to the commit
  date only when the stamp is absent.
- All 90 recipes' `updatedAt` were backfilled to their last commit date on main.
- Builder Deploy and the services publication stamp `updatedAt` at write time
  (`recipeWriteStamp`).
- `scripts/validate-recipe-updated-at.ts` fails a content change without a
  newer stamp. It runs in CI's validate-recipes job and in `apps/api`'s
  lint-staged config.
- `archive-merged-drafts` keeps drafts for stamp-only changes. It shares
  `scripts/recipe-content.ts` with the guard.

## Why we did it that way

**`?ref=` over documenting "must equal the default branch".** Passing the
branch makes the re-sync and the Deploy stale-base guard read the same branch
by construction. All callers of `getPublishedRecipe` mean "what a Deploy would
overwrite", so none depended on the default branch as such.

**A `resolveCurrentRecipe` wrapper, not an exported pair.** The #2900
pass-through couples the two halves: the published recipe fetched for `meta`
is handed to the re-sync. Save paths deliberately keep `resolveStoredRecipe`, so
a save never re-syncs the row it is writing.

**No `Promise.all` for the two reads, despite #2900 suggesting it.** Once
`updatedAt` is primary, the commit-date read is a rare fallback. Running it
concurrently would put a Commits call back on every open.

**The backfill uses commit dates, not "now".** Trusting `updatedAt` alone left
a gap: hand edits never bumped it, so drafts saved after an old stamp but before
a hand fix would stop re-syncing. Bumping every recipe to "now" would make every
draft row look stale and discard in-progress author work. The last commit date
is exactly what the git check was already comparing against, so freshness
decisions are unchanged.

**The backfill nearly archived every draft.** `archive-merged-drafts` archives
the draft of every modified flat recipe on push to main, and the backfill
modifies all 90. Page-only service publications, which now stamp the recipe,
had the same problem on a smaller scale. We chose to make the job skip
stamp-only changes over dropping the backfill or splitting it out (user
decision). The skip rule and the guard share one definition of "content" so
they cannot disagree.

**The services publication stamps only when the recipe content changed.**
The first cut stamped every publication. Review caught that a page-only
publication then moved `updatedAt`, and the next open re-synced, discarding
unsaved builder edits that the archive job had just kept. Now the recipe is
compared, minus its stamp, with the checkpoint's parent commit. If the content
is equal, the committed bytes are written back unchanged. Comparing against the
parent commit, not `main` by name, means a concurrent merge can't race the
read. A saved version (an immutable tag) is matched against the draft by recipe
*content*, with every other file still compared by blob SHA. That keeps older
tags without a stamp publishable. Read failures other than a 404 throw a
"could not read" error instead of a false "does not match".

**The guard's floor is per file, not the merge base.** The guard also rejects a
stamp more than 5 minutes in the future, and a content change stamped earlier
than the last base commit that touched that recipe. We first agreed "at or
after the merge-base commit date". But a CI `pull_request` checkout is the
merge ref, so the merge base is main's tip. Every unrelated merge would then
have failed every open recipe PR, including builder Deploy PRs. The per-file
floor still rejects a 1 ms bump once the backfill lands.

**The pre-commit hook lives in `apps/api`'s lint-staged config.** lint-staged
gives each file to its closest config, so the root glob never ran for recipes.
This only showed up when the backfill commit staged 90 recipes and the hook
reported "no tasks to run". The CI step is the real gate, since web-editor
commits skip hooks.

## What we almost got wrong

- Freshness first shipped trusting any present `updatedAt`, which silently
  undid #2489 for the hand-fix backlog. Caught on review of the agent report.
- Stamping every services publication would have re-synced over unsaved
  edits after page-only publications. Caught by the branch review.
- The backfill would have mass-archived drafts on merge. Caught before push by
  reading `archive-merged-drafts.ts`.

## Open questions

- A non-datetime `updatedAt` fails the recipe schema parse (the re-sync is
  skipped with a warning). It doesn't fall back to the git date. `validate-recipes`
  blocks such a stamp in CI anyway.
- Merge-time checks: re-run the backfill if a hand fix lands on main first,
  since git merges it silently and leaves an older stamp. Merge at a quiet time,
  because a builder still on the pre-branch code sees the backfill commit's date
  as every recipe's commit date.
- The guard never checks pushes to main, because the merge base is HEAD there.
