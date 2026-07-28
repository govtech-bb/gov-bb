# Session summary — Patch brace-expansion DoS advisories (#2088)

**Date:** 2026-07-28 · **Branch:** `fix-brace-expansion-override-2088` (off `main`) · resolves part of #2088

## What shipped

Two of the three `brace-expansion` advisories flagged by the daily security
audit in the `apps/api` prod tree are now cleared, via pnpm `overrides` in
`pnpm-workspace.yaml`:

- `brace-expansion@>=2.0.0 <2.1.2: ^2.1.3` — bumps the 2.x line (typeorm,
  exceljs/archiver) from `2.1.1` → `2.1.3`.
- `brace-expansion@<1.1.16: ^1.1.16` — bumps the 1.x line (glob/minimatch) from
  `1.1.15` → `1.1.16`.

Both patched versions were published within the repo's `minimumReleaseAge`
cutoff, so both are added to `minimumReleaseAgeExclude` (same pattern every
other security override here follows).

The lockfile diff is surgical: only the two `brace-expansion` entries change
(11 insertions / 9 deletions).

## Why it looks the way it does

- **Overrides live in `pnpm-workspace.yaml`, not root `package.json`.** The
  issue's suggested fix targeted `package.json` `pnpm.overrides`, but pnpm 11
  stopped reading that — every override in this repo is already in
  `pnpm-workspace.yaml`. Followed the current convention.

- **We deliberately stay on the 1.x/2.x lines and leave one advisory open.**
  There are *three* advisories, not two. The third (OOM,
  GHSA-mh99-v99m-4gvg) is only patched in `brace-expansion@>=5.0.8`. The 5.x
  release is a breaking rewrite — it switched from a default function export
  (`module.exports = expand`) to a named export (`{ expand }`). The minimatch
  versions still shipped transitively — `3.1.5` (glob), `5.1.9`
  (exceljs→archiver→readdir-glob), `9.0.9` (typeorm/rimraf) — call the old
  default export. Forcing `5.0.8` was verified to throw at runtime
  (`expand is not a function` / `brace_expansion_1.default is not a function`),
  which would break entity globbing (typeorm) and archive globbing (exceljs) in
  `apps/api`. So the OOM advisory cannot be cleared with a brace-expansion
  override alone — it needs a separate, wider effort to bump every transitive
  minimatch to a 5.x-compatible major (blast radius across glob@7 / typeorm /
  archiver). That is tracked as follow-up on the issue, not attempted here.
  An inline comment in `pnpm-workspace.yaml` warns against a naive 5.x bump.

- **Don't trust the audit's "patched version" blindly.** The naive reading —
  force the version the audit names — is exactly what breaks runtime here. The
  correct move was to verify API compatibility of the patched major against its
  actual transitive consumers before forcing it.

- **Minimal lockfile diff, not a full refresh.** A `pnpm clean --lockfile` +
  fresh resolve produced a ~1,125-package churn (and incidentally moved
  unrelated advisories) — too broad for a targeted security PR. The final
  change restores `origin/main`'s lockfile and applies only
  `pnpm install --lockfile-only` with the override, so nothing unrelated moves.

## Verification

- `nx run-many -t build --exclude=landing` — 20 projects compiled.
- `nx run api:test` — 1178 passed, 9 skipped.
- Runtime: drove a brace pattern (`src/{a,b}.ts`) through each real minimatch
  install (`3.1.5`, `5.1.9`, `9.0.9`) against the backported brace-expansion —
  all correct.
- `pnpm install --frozen-lockfile` — lockfile consistent with the overrides.
- `pnpm audit --prod` — both exponential-DoS advisories (GHSA-3jxr-9vmj-r5cp)
  gone; the OOM advisory (GHSA-mh99-v99m-4gvg) remains as the documented
  residual.
