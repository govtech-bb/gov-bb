# Estate import runbook, once per environment (#3238)

## Context

`apps/api_v2/README.md` "Importing the estate" and ADR 0077 still described a one-off sandbox import. They told the operator to merge `main` into `v2-rewrite`, named a `landing_v2` app that's gone, and cited an `import:<source>` history actor that migration `007` replaced. The sandbox re-import (#3234) was about to follow that stale text.

## What we did

- Rewrote the README section as the runbook for sandbox (#3234), staging (#3229) and prod (#3230).
- Amended ADR 0077 in place: status line, two Consequences bullets, and a new Amendment section.
- Brought #3234's body in line with the new runbook and commented on #3235 that its `--` invocation won't run.

## Why we did it that way

- **Amend, not supersede.** The decision hasn't changed: a database is loaded once, then written only by the editor. What changed is the reading of "once": it means once per database. The repo amends ADRs in place when the decision stands and supersedes them only when it's reversed. We kept the filename because #3120 renumbers the colliding `0077-*` files at merge time.
- **Point 3 is corrected in the Amendment, not rewritten.** Decision text stays as it was decided, so the grep for `import:<` still hits the original point 3. That's deliberate.
- **The merge-`main` step was dropped, not deferred to #3229.** Sandbox imports `v2-rewrite`'s own content, which has diverged from `main` on purpose (#3486, #3487). After #3131 there is only `main`, so the step is redundant or wrong for every import still to run.
- **The editor-write check has three parts, not the histogram alone.** Since `007`, `system` is the only machine actor. Pending saves write no history event. On sandbox, category edits made before `007` left no events.
- **Check (b) can't run yet, and the runbook says so.** The deployed image has no `psql`, and the importer doesn't report a revision count. #3188 adds the count. Until it does, the runbook and ADR say no forced re-import runs. The reviewer marked this as blocking, because the first draft presented the check as runnable today.
- **The freeze stays one switch.** `CONTENT_FREEZE=true` is the whole freeze, since #3237 closed as covered by #3236. The drift job stays on: it writes only generated files, so the freeze check never trips on it.
- **Review fixes.** Others from the dev-reviewer's pass:
  - `ENV` is now set in step 2, where it's first used.
  - Step 3 checks the running image is tagged with the noted sha, because the 22 Oct rehearsal imported from a stale image.
  - The README says `"collections":0,"records":0` is normal on a replace, because `--force` keeps collections.

## Open questions

- Staging and prod cluster and service names are assumed to follow sandbox's pattern, pending #3130.
- `import-estate.ts`'s header comment still says "One-time". That's code, so we left it out of this docs-only change.
