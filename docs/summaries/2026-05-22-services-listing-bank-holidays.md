# Surface bank-holiday calendar in /services — Session Summary

**Date:** 2026-05-22
**Branch:** fix/services-listing-bank-holidays
**Resolves:** [#65](https://github.com/govtech-bb/gov-bb/issues/65)

## What was built

Made `/bank-holiday-calendar` discoverable from `/services`. Before this change, the page existed (at `apps/landing/src/routes/bank-holiday-calendar.tsx`) but users could only reach it by typing the URL — it wasn't surfaced in the registry-driven alpha services listing or anywhere else.

## Why the diff is one line

The investigation took longer than the fix. A content stub for the bank-holiday calendar already existed at `apps/landing/src/content/bank-holiday-calendar.md` — someone had added it expecting it to register the page in `/services`. But the stub set `category: work-employment`, which the registry uses to build URLs. The registry produced `url = "work-employment/bank-holiday-calendar"` instead of `"bank-holiday-calendar"`, so:

1. The `/services` link pointed at the wrong URL.
2. Following that link went through the MDX catch-all (`$.tsx`) and rendered the stub's empty body, not the React calendar.

Removing the `category` field fixes both: the registry leaves the URL as the bare leaf (`bank-holiday-calendar`), and TanStack Router's explicit file route for `/bank-holiday-calendar` takes precedence over the catch-all, so the real React calendar renders. The lead had explicitly asked for the URL to stay the same and for the page not to be filed under a category, so this matched direction exactly.

## Why this approach, not the others

The issue listed three options: a content stub, a hardcoded list in `services.tsx`, or a homepage "information services" section. The lead chose the stub.

- **Hardcoded list in `services.tsx`** — would have forked the listing into two registries (auto-generated MDX + hand-maintained array). Easy to forget about later.
- **Homepage section** — more visible to users, but doesn't fix `/services` itself, and the same pattern would need to be repeated for any future route-only pages.
- **Stub** — uses the existing registry mechanism. The only catch is the URL-collision behaviour with the explicit React route, which TanStack handles correctly (explicit routes beat splat routes).

## Why no ADR

Considered one for "uncategorised content-stub MDs may register route-only pages in the listing while letting explicit routes take precedence." Rejected — the precedent already exists. Four other uncategorised MDs (`terms-conditions`, `what-we-mean-by-alpha`, `whats-changing`, `welfare-department`) already live at the root URL. This change uses that existing convention rather than establishing a new one.

## Why no other fields were touched

The stub also has `description`, `featured: false`, and `publish_date` fields. The minimal fix removes only `category`. Trimming the other fields was considered (the listing doesn't use them) but deferred — none of them are wrong, and a grep showed no other code path reads them for this stub. Keeping the diff to one line keeps the risk floor at zero.

## Verification

- `pnpm test` from `apps/landing` — 55/55 pass (5 files).
- Grep for `work-employment/bank-holiday-calendar` returns no results.
- Static trace through `registry.ts:101-106` confirms `url = "bank-holiday-calendar"` for the new frontmatter.
- Runtime browser verify deferred to pre-merge (requires VPN for the predev forms-manifest fetch; flagged in the plan).
- Typecheck and lint reported pre-existing environment failures (missing `nitro` type config, missing `@tanstack/eslint-config`) unrelated to this MD-only change.

## Key files

| File | Change |
|------|--------|
| `apps/landing/src/content/bank-holiday-calendar.md` | Remove `category: work-employment` from frontmatter |
| `docs/plans/services-listing-bank-holidays.md` | New — plan doc for the change |
