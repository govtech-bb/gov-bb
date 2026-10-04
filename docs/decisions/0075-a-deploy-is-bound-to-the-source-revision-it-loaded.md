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

## Consequences

- One extra Contents `GET` on the base branch per Deploy and per legacy form
  open. Both are cheap next to the GitHub calls those paths already make.
- After a recipe merges — including the author's own Deploy PR — the next
  Deploy from the same tab is refused until the author reloads. That is the
  intended friction: the reload is what lets them see what they are about to
  overwrite.
- The services path's `baseRecipeSha` is captured once at adoption and never
  refreshed, and no UI discards a service draft, so its "Reload and compare"
  message has no in-app action. A draft row that is re-synced from the
  committed recipe (the #2489 follow-up) will therefore make that service's
  publish refuse until the service is re-adopted. Known gap, tracked with the
  services follow-ups from the #2489 plan; not changed here.
- The dormant `POST /builder/publish` in `form_builder_api` (#2391) does not
  carry a loaded revision and must adopt this before it is revived, or be
  removed — the same requirement ADR 0070 already places on it.
- A new PR-based authoring flow is not complete without this guard. Reviewers
  should ask where the loaded revision is captured and where it is compared.
