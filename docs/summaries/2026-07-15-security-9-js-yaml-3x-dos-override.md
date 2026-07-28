# 2026-07-15 — gov-bb-security#9: close the js-yaml <3.15.0 DoS (3.x line)

## Context

Security issue (severity:important): js-yaml quadratic-complexity DoS in
merge-key handling (GHSA-h67p-54hq-rp68, CVE-2026-53550). The advisory has
**two** affected ranges, and `main` had only closed one:

| Range | First patched | Status before this change |
| --- | --- | --- |
| `>=4.0.0 <=4.1.1` | `4.2.0` | ✅ already fixed (existing 4.x override; 4.2.0 installed) |
| `<3.15.0` | `3.15.0` | ❌ vulnerable — `3.14.2` via `gray-matter`, no override |

`pnpm audit` on `main` reported 1 moderate: `js-yaml <3.15.0` via
`gray-matter>js-yaml` in `apps/form_builder`, `apps/landing`, `packages/content`.
The issue body quoted only the 4.x fix (`>=4.1.2`), which is why the 3.x line was
originally missed.

> This fix was coded once in an earlier session but that branch was never
> committed, so the vulnerability was still live on `main`. This is the re-do.

## What we did

- Added a second override to `pnpm-workspace.yaml`:
  `js-yaml@>=3.0.0 <3.15.0: ^3.15.0`, mirroring the existing 4.x override.
- Added `js-yaml@3.15.0` to `minimumReleaseAgeExclude` (the repo's pattern for
  every managed security-override version).
- `pnpm install` regenerated the lockfile: `gray-matter → js-yaml` now `3.15.0`;
  `3.14.2` gone; 4.x stays `4.2.0`.

## Why we did it that way

- **Override, not a parent bump.** `gray-matter@4.0.3` is the latest release and
  still ranges `js-yaml ^3.13.1`, so there is no parent version that pulls a
  fixed js-yaml. `3.15.0` satisfies `^3.13.1` and stays on the 3.x major, so
  `gray-matter`'s API contract is unchanged (js-yaml 4.x has a different API).

## Verify

`pnpm audit` → "No known vulnerabilities found"; `pnpm why js-yaml` shows only
`3.15.0` and `4.2.0`; build clean across 20 projects; `landing` (the frontmatter
consumer) 211/211 in isolation. Reverted unrelated `routeTree.gen.ts` formatting
churn regenerated during install.

## Open questions

- Issue tracked in `gov-bb-security`, fix lands in `gov-bb` — confirm how the PR
  should reference/close the security-repo issue (same as #8).
