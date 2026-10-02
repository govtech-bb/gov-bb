# Session summary — archive-merged-drafts loud-skip + real scripts/ CI coverage (#2350)

**Date:** 2026-08-21 · **Branch:** `fix/2350-archive-drafts-missing-secret` (off `main`) · addresses #2350 (code portion)

## What shipped

`scripts/archive-merged-drafts.ts` no longer fails the `Archive merged drafts`
workflow red when a secret is missing. A missing `ARCHIVE_DRAFTS_API_URL` /
`ARCHIVE_DRAFTS_TOKEN` now emits a GitHub `::warning::` naming the secret + a
step-summary line and **exits 0** (job green, nothing archived). Genuine
abnormal states (`GITHUB_EVENT_PATH` absent) still exit 1; real archive errors
unchanged. Root `scripts/` is now an nx `test`-only project so its specs run in
CI.

## Why it looks the way it does

- **Loud skip, not red, for a missing secret.** The script already documents
  itself as "Best-effort by design: archival must not block PR merge" — but its
  `exit(1)` config guards did the opposite, turning an un-provisioned org secret
  into a red ❌ on every recipe push. Red should mean "an actionable-in-PR
  error," not "an ops secret isn't set." So a missing secret became a loud skip
  (warning + step summary + exit 0), which also stops alarm fatigue from masking
  a genuine archive failure when one happens.

- **The decision is a pure function; side effects live at the edge.**
  `resolveArchiveConfig(env)` returns `{apiUrl,token}` or `{skip:reason}` — no
  I/O, unit-testable on both branches. The `::warning::`/step-summary/`exit`
  emission stays in `main()`. The skip reason names the **repo secret**, never
  the internal `API_URL` var, so the CI warning is actionable.

- **Wiring scripts/ into CI uncovered a bigger gap.** Root `scripts/` was not an
  nx project and no vitest config included it, so `archive-merged-drafts.spec.ts`
  had never run — and still used `jest.fn()` (Vitest provides `vi`, not `jest`).
  Adding `scripts/vitest.config.ts` + `scripts/project.json` (test-only) made
  `nx run-many -t test` run it. That immediately surfaced a *second* orphaned
  spec, `project-board-sync.spec.ts`, also on `jest` — fixed too, since a wired
  project must be green. This is scope beyond the archive fix, but an unavoidable
  consequence of "make the archive path actually verified in CI," which is the
  issue's core complaint.

- **No hardcoded URL; no workflow-file change.** The environment URL stays a
  repo secret. The script's exit 0 makes the job green with no `.yml` edit.

## Verification

- `nx run scripts:test` — 56 pass across 4 spec files (previously 0 ran).
- Ran the script directly: missing `ARCHIVE_DRAFTS_API_URL` →
  `::warning::…ARCHIVE_DRAFTS_API_URL secret is not set` + step summary + exit 0;
  missing `GITHUB_EVENT_PATH` → exit 1.
- Lint clean on touched files. Unrelated pre-existing failures in
  api/landing/form_builder/analytics reproduce on clean `main` (form-builder-app
  confirmed) — this diff is scripts-only.

## Out of scope (maintainer)

- **Create `ARCHIVE_DRAFTS_API_URL`** with the confirmed environment URL (the DB
  holding builder drafts — sandbox, to be confirmed), then re-run the workflow on
  a recent recipe commit. Until then the job is green-with-a-warning and archives
  nothing — by design.
