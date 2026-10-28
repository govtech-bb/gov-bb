# Recipe override-key and removal guards

2026-10-13 · recipes, form-types, form_builder_api, CI · #2713, #2409

## Context

#2409 (builder publishes silently reverting hand edits) and #2713 (override
keys silently dropped) were re-evaluated against `main`. Most of #2409's
root cause had already been closed by #2489 (#2892, #2897), #2878 and #2881,
so the issue was trimmed to two items. #2713 was entirely untouched. Three
branches shipped in parallel:

- `2713-override-key-guard`
- `2409-recipe-removal-guard`
- `2409-archive-retry-429`

## What we did

- **#2713:** `checkOverrideKeys` (form-types) runs in `validate-recipes` and
  the Deploy validator, and the 81 dead keys were deleted from 10 recipes.
  The reasoning is in ADR 0077.
- **#2409 removal guard:** `validate-recipe-removals` compares changed
  recipes with their merge base and counts:
  - webhooks
  - MDA delivery emails
  - catchment routing
  - geocode targets
  - address lookups

  It runs from its own workflow, and the `recipe-removal-override` label
  skips it. The base-comparison code was extracted from
  `validate-recipe-updated-at` into `scripts/recipe-base-diff.ts`.
- **#2409 archive job:** it retries on HTTP 429 (`Retry-After`, at most 3
  retries).

## Why we did it that way

- **Delete the keys rather than translate them.** Nothing reads them outside
  the schema, so deleting is runtime-neutral, and it lets the guard land at
  once. Translating them (`helperText` → `hint`, `accept` →
  `validations.fileTypes`, `readonly`, the homeschooling conditional) changes
  what citizens see, so those decisions go to the service owners in a
  follow-up issue.
- **A guard over `.strict()`.** See ADR 0077. Wiring the guard into Deploy
  was first suspected to be dead code. It wasn't: the legacy Deploy sends
  the draft unparsed and serialises it verbatim, so a phantom key in a draft
  row would reach the committed file.
- **Counts, not identity.** Processors carry no ids. A drop in a category's
  count is the signal, so a reshuffle or reorder passes. Review widened "MDA
  email" from `*mdaEmail` recipients to every non-applicant recipient
  (`classifyRecipientField`), because a fixed address or `contactDetails.`
  recipient is MDA delivery too.
- **The removal guard has its own workflow.** `ci.yml` uses the default
  `pull_request` types, and a re-run reuses the original payload, so a label
  added later would never be seen. There is deliberately no `paths:` filter:
  if this becomes a required check, a path-filtered workflow never reports on
  unrelated PRs and blocks them.
- **The archive fix is client-side.** The API throttle (5 requests / 10 s) is
  the only brute-force limit on the admin token, so `@SkipThrottle` was
  rejected.

## What we almost got wrong

- The issue's evidence listed `2405610f` as stripping `catchmentRouting` and
  `mdaEmail`. Replaying it showed only `catchmentRouting` was removed. The
  other lines were the builder reordering keys, which is exactly the noise a
  count-based guard ignores.
- The first survey of phantom keys reported zero because of a wrong
  `--strip-components` on `git archive`. A zero from a new survey is a
  reason to check the survey before trusting it.

## Open questions

- Nested override keys (`ui.*`, `geocodeTargets.*`) and keys placed beside
  `ref` are unguarded. The audit found none today.
- The removal guard blocks merges only once it is added to the "Main CI
  Required" ruleset, which is a repo-admin step.
- A recipe renamed and stripped in the same PR isn't checked
  (`--diff-filter=AM`).
- An unverified race remains: a tab saves after a fix merges, then reloads
  and deploys. The re-sync and source-SHA checks don't cover it, and the
  removal guard is its net.
