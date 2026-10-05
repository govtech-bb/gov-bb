# 0075 — A PR-based authoring flow binds a deploy to the source revision it loaded

**Date:** 2026-10-03
**Status:** Accepted
**Related:** [#2489](https://github.com/govtech-bb/gov-bb/issues/2489) (this
decision), [#2409](https://github.com/govtech-bb/gov-bb/issues/2409) (same
root cause, wider evidence), [#2477](https://github.com/govtech-bb/gov-bb/pull/2477)
→ [#2479](https://github.com/govtech-bb/gov-bb/pull/2479) /
[#2482](https://github.com/govtech-bb/gov-bb/pull/2482) (the incident), ADR
0057 (one flat file per form; the DB row is scratch), ADR 0059 (the "DB row
wins" rule is scoped to content), ADR 0070 (a deploy reuses the artifact's
open PR)

## Context

Three flows in this repo let an author ship a change as a GitHub pull request
that overwrites a file whose path is derived from the artifact's id: the
builder's legacy Deploy (a recipe), the services workspace's publish (a
manifest, pages and a recipe), and `/content` (a landing page). Each PUT
through the Contents API is a whole-file overwrite of whatever is committed on
the base branch at that moment.

The author, though, is working from the revision they *loaded* — possibly
hours earlier. On 2026-08-25, #2477 merged a fix to two funeral recipes; within
the hour #2479 and #2482 republished both forms from builder sessions opened
before the merge and reverted every one of those identifiers. Both PRs were
green. No row lifecycle can prevent this: the Deploy carried the browser's
in-memory recipe, `PUT` it over the (archived) row, then over the committed
file. The defect is not "a stale row outlived the fix" but "a deploy did not
know what it was replacing".

Two of the three flows already guarded against it: content records
`expectedRevision` when a page is opened and refuses to publish on
`stale-revision`; the services publish path records `baseRecipeSha` (the blob
sha of the committed recipe on the base branch) at adoption and refuses when
`sourceSha(path) !== baseRecipeSha`. The legacy Deploy had no notion of what
revision the author had loaded, and it is the flow that produced the incident.

## Decision

**Every PR-based deploy carries the identity of the committed revision the
author loaded, and refuses to write when the base branch no longer holds that
revision.**

- The identity is the committed file's blob sha on the base branch (what the
  Contents API already returns), or `null` when nothing was committed when the
  form was opened. For the legacy Deploy, `loadFormWorkspace` captures it and
  `publishRecipe` requires it as `expectedSourceSha` — required, not optional:
  a deploy that cannot say what it loaded cannot prove it isn't overwriting a
  fix that merged since.
- The comparison happens before **any** write: no draft-row `PUT`, no branch,
  no PR. A mismatch surfaces to the author as *"The published source for
  &lt;formId&gt; changed after you opened it. Reload and compare before
  deploying."* — the services path's wording, so the three flows read alike.
- A `null` expectation with a committed file present is a mismatch. The author
  believed the form was new; it now exists on the base branch (typically their
  own earlier Deploy merged while the tab stayed open).
- The identity is **bound to the content the author loaded** and is never
  refreshed on its own. Background revalidation of a mounted route must not
  update it any more than it may replace unsaved edits; New and Duplicate clear
  it with the loaded id. Refreshing the sha without reloading the content would
  recreate the incident with a newer timestamp.
- A failed read at load degrades to `null`, never to "skip the check". The
  guard then verifies that belief against the live sha: with a committed copy
  present it refuses, so the cost of an outage at load is one reload prompt,
  never a silent overwrite. Opening a form does not depend on the read
  succeeding.

### The draft row follows the committed recipe

The guard above stops a deploy from *overwriting* a fix; it cannot stop the
builder from *showing* a stale row after the author reloads. So the row itself
is kept in line with the committed recipe (the second half of #2489):

- **When a form is opened and a committed copy exists, a draft row saved
  before the latest commit to that recipe is replaced by the committed recipe,
  in place.** "Latest commit" is the committer date of the newest commit
  touching the flat file on the branch the builder reads recipes from — the
  committer date, not the author date, because a rebased fix lands later than
  it was written and landing is what makes a draft stale. A row with no
  committed copy is never touched.
- **Staleness is decided by the database, in one statement**, from the row's
  own `updated_at`: `UPDATE … WHERE updated_at < <committed at>`, answered by
  the number of rows it matched (TypeORM's Postgres `query()` returns
  `[rows, rowCount]` for an `UPDATE`). Two tabs opening the same form race
  safely — one replaces, the other sees the result. The builder learns whether
  it should show the committed copy or the row from that single answer.
- **A row's `updated_at` is trusted only once a save has moved it**
  (`updated_at > created_at`). Until #2489, nothing bumped `updated_at` after
  insert — both stamps take the same `NOW()` default — so an older row's
  timestamp says nothing about when it was last edited, and replacing it could
  discard un-deployed work. Such a row is left alone until its next save,
  which gives it a real timestamp. Rows created after #2489 and never saved
  again share that shape and are left alone too; a Deploy is a save, so a
  deployed row always qualifies.
- **A draft saved between a Deploy and its merge is replaced by the merged
  recipe on the next open.** This is intended, and the same rule the
  post-merge archive job applies ("drafts expire on publish"): once a Deploy
  merges, the committed recipe is the working copy, and anything the author
  typed into the row while the PR was in review was never part of what they
  deployed.
- **Any failure keeps the draft and never blocks opening the form.** The
  GitHub read, the committed-recipe fetch and the API call can each fail; the
  builder logs and serves the row it has. The stale-base guard above is the
  backstop for a stale row that could not be re-synced.

> **Amended 2026-10-04 ([#2878](https://github.com/govtech-bb/gov-bb/issues/2878)).**
> "Newer" is decided from the committed recipe's own `updatedAt`, not the
> commit date: the builder sends that stamp as the value the `UPDATE`
> compares `updated_at` against, and reads the committer date only for a
> committed copy whose `updatedAt` is absent (a stamp that is not a datetime
> fails the recipe's schema parse, so the draft is kept). The check no longer
> depends on the recipe living in git (govtech-bb/projects#918 may move
> recipes out of it), and the per-open Commits `GET` goes away except on that
> fallback. In return every write must move `updatedAt`: the builder Deploy
> and the services publication both stamp it at the write — the services
> publication only when the recipe's content (`updatedAt` aside) differs from
> the recipe in the checkpoint's parent commit. A pages-only publication
> writes the committed recipe back byte for byte, so its stamp does not move
> and the next open does not re-sync a draft row over unsaved builder edits.
> A saved version published later is matched against its checkpoint tag by
> recipe content and by blob sha for every other file, so the stamp it was
> written with does not matter; a failed GitHub read is reported as such, not
> as a mismatch. `pnpm validate-recipe-updated-at` (an always-run step in
> CI's Validate Recipes job and a lint-staged pre-commit task) fails a hand
> edit that changes a recipe's content without moving it forward to at least
> the recipe's last change on the base, and any stamp more than five minutes
> in the future. Every
> recipe whose `updatedAt` predated its last commit on `main` was backfilled
> to that commit's committer date in the same change (all 90 flat files), so
> the switch alters no freshness decision: the stamp a draft row is compared
> against is the date the git check was already using. The post-merge archive
> job (`archive-merged-drafts`) keeps a form's draft when the merged change
> only moved `updatedAt` — as the backfill does — since nothing new was
> published over it; the guard and the
> job share one definition of a stamp-only change (`scripts/recipe-content.ts`).

## Consequences

- One extra Contents `GET` on the base branch per Deploy and per legacy form
  open. Both are cheap next to the GitHub calls those paths already make.
- After a recipe merges — including the author's own Deploy PR — the next
  Deploy from the same tab is refused until the author reloads. That is the
  intended friction: the reload is what lets them see what they are about to
  overwrite.
- Opening a form that has a draft row costs one Commits `GET` and, when a
  committed copy exists, one Contents `GET` plus one API call. The published
  fallback (no row) pays nothing extra: it already *is* the committed recipe.
- The pre-#2489 backlog of stale rows is not drained by this change. Each such
  row is re-synced only after its next save gives it a trustworthy
  `updated_at`, or when it is archived at the next merge. A row created after
  #2489 and never saved again is likewise skipped; the "reload" guard still
  protects a Deploy from it, but a reload then shows the stale row. Widening
  the rule to rows created after the change shipped (a date cutoff) is a
  one-line follow-up if that gap bites.
- The services path's `baseRecipeSha` is captured once at adoption and never
  refreshed, and no UI discards a service draft, so its "Reload and compare"
  message has no in-app action. A draft row re-synced from the committed
  recipe therefore makes that service's publish refuse until the service is
  re-adopted. Known gap, tracked with the services follow-ups from the #2489
  plan; not changed here.
- The dormant `POST /builder/publish` in `form_builder_api` (#2391) does not
  carry a loaded revision and must adopt this before it is revived, or be
  removed — the same requirement ADR 0070 already places on it.
- A new PR-based authoring flow is not complete without this guard. Reviewers
  should ask where the loaded revision is captured and where it is compared.
