# Session summary — Patch js-yaml merge-key DoS advisory (#2089)

**Date:** 2026-07-28 · **Branch:** `fix-js-yaml-override-2089` (off `main`) · resolves #2089

## What shipped

The HIGH `js-yaml` merge-key quadratic-CPU DoS advisory
([GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m)) is
cleared from the prod tree by raising the **existing** js-yaml 4.x override in
`pnpm-workspace.yaml`:

- `js-yaml@>=4.0.0 <4.1.2: ^4.1.2` → `js-yaml@>=4.0.0 <4.3.0: 4.3.0`
- `minimumReleaseAgeExclude` entry `js-yaml@4.1.2` → `js-yaml@4.3.0`

Lockfile: `js-yaml@4.2.0 → 4.3.0`. The 3.x override and `js-yaml@3.15.0` are
untouched.

## Why it looks the way it does

- **This supersedes an existing override; it doesn't add one.** The repo already
  had a js-yaml 4.x override from an earlier advisory, forcing `^4.1.2`. That
  silently resolved to `4.2.0`, which this new advisory's range (`>=4.0.0
  <4.3.0`) still covers — so the tree *looked* patched but wasn't. Raising the
  floor to `4.3.0` is the actual fix.

- **Pinned to `4.3.0`, not the issue's `>=4.3.0`.** js-yaml's `latest` is
  `5.2.2`, so an open-ended `>=4.3.0` override would let the resolver pull
  js-yaml **5.x** (a breaking major) into `@nestjs/swagger` and the
  `@tanstack/react-start` build paths. `4.3.0` is the only patched release on
  the `v4-legacy` line — a minor bump within the same major, no API-break risk.
  (This is the same "don't force a transitive dep across a breaking major just
  because the audit names it" reasoning that kept brace-expansion on 1.x/2.x in
  #2088.)

- **Staying on 4.x also dodges the separate flow-collections advisory.** A
  different js-yaml advisory is patched only in `>=5.2.2`. Verified empirically:
  at `4.3.0` the prod audit reports **zero** js-yaml advisories — the
  flow-collections one does not affect the 4.x line in this tree, so the
  conservative pin clears everything without the 5.x risk.

- **Minimal lockfile update.** `pnpm install --lockfile-only` (no `pnpm clean`),
  so only the js-yaml entries move.

## Verification

- Lockfile: `js-yaml@4.2.0` gone, `4.3.0` present, `3.15.0` unchanged, no `5.x`.
- `pnpm install --frozen-lockfile` — lockfile consistent with the overrides.
- `pnpm audit --prod` — **0 js-yaml advisories** (GHSA-52cp-r559-cp3m cleared).
- `nx run-many -t build --exclude=landing` — 20 projects compile.
- `nx run api:test` — full api suite green (js-yaml is consumed by
  `@nestjs/swagger` in `apps/api`).
