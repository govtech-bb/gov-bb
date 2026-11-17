# Content freeze CI guard (#3236)

## Context

After the prod estate import, the api_v2 database is the source of truth for
landing pages (ADR 0129, "deployed content databases are loaded once then
written only by the editor", on `v2-rewrite`). Any landing markdown edit that
merges to `main` after that is silently lost. #3236 asked for a CI check,
switched by the repository variable `CONTENT_FREEZE`, that fails those PRs.

## What we did

- Added `.github/workflows/content-freeze.yml`. It runs on `pull_request`
  against `main` only. Its one job is gated by
  `if: vars.CONTENT_FREEZE == 'true'`. It lists the PR's files with
  `gh api .../pulls/{n}/files` and fails on any
  `apps/landing/src/content/**/*.md` or either `categories.ts`, with an error
  pointing to editor_v2.
- Not in the PR: adding "Content freeze" to ruleset 24523703, setting the
  variable at the prod import, and the runbook text (#3238).

## Why we did it that way

- **Its own workflow, not a job in `ci.yml`.** `ci.yml` also runs on `push`
  and `workflow_dispatch`, where there is no PR to diff, and it already
  differs between `main` and `v2-rewrite`.
- **No `paths:` filter.** A path-filtered required check never reports on PRs
  that don't touch the path, and those PRs stay blocked forever. A job-level
  `if:` that is false gives "skipped", and the ruleset counts skipped as
  passing. So the check can be required now, and the freeze stays a single
  switch on the day.
- **`branches: [main]`.** `v2-rewrite` markdown is the source of the estate
  snapshot and has to stay editable. Without the filter the guard would reach
  `v2-rewrite` PRs once `main` is next merged into it.
- **Changed files from the API, not `git diff`.** No checkout, no
  `fetch-depth: 0` on a large monorepo, and no `uses:` to SHA-pin.
- **Rejected: a push ruleset restricting file paths.** It's native and
  stronger, but it would be a second switch next to the variable, its error
  can't point to editor_v2, and it would block #3165's eventual deletion of
  the markdown.
- **Both `categories.ts` are guarded.** This is what let #3237 (stopping the
  v1 form builder writing markdown) close: the form builder only opens PRs
  against `main`, so this check stops its writes too.
- **Deletions fail as well.** While landing still falls back to static pages
  on an api_v2 miss, deleting a markdown file changes what citizens see.

## What we almost got wrong

The plan's script piped `gh api` straight into `grep ... || true`. The
default `run:` shell is `bash -e` without `pipefail`, so a failed API call
left the file list empty and the step printed "OK": the guard failed open.
The fetch now runs on its own line. The plan also read only `.filename`.
For a renamed file that's the new path, so a page moved out of
`apps/landing/src/content/` (or renamed to `.mdx`) slipped through. The
script now checks `previous_filename` too. Both came out of review and are
checked against PR #2536 and a 404 PR number.

## Open questions

- Switching the variable on doesn't re-run open PRs that were already
  skipped. The ruleset isn't strict, so they stay mergeable until someone
  pushes to them. A re-trigger step was requested for the #3238 runbook.

- An admin must add "Content freeze" to ruleset 24523703 after the first run.
  Until then, a red check doesn't block the merge.
- Who flips the variable, and when. The default is step 0 of the prod import
  (#3230), before the snapshot is regenerated.
- The `v2-rewrite` → `main` merge (#3131) touches landing markdown. It must
  merge while the variable is unset, or with an admin bypass.
- #3165 must remove the check from the ruleset before it deletes this
  workflow, or the check sits "Expected" forever.
