# Session summary — Mask PII in search queries sent to analytics (#2079)

**Date:** 2026-07-22 · **Branch:** `mask-search-query-pii-2079` (off `main`) · relates to #1751

## What shipped

The public search box was sending citizens' raw queries to Umami Cloud (a third
party) on four events. Queries now pass through `maskSearchQuery` before they
leave.

- **New** `packages/analytics/src/mask-search-query.ts` — masks **emails** and
  **runs of 6+ digits** (first + last char kept, middle asterisked), trims /
  collapses whitespace, caps at 60 chars; ordinary words and short numbers
  (years, "under 11") untouched.
- **`packages/analytics/src/index.ts`** — `trackEvent` masks a `query` string
  property (on a shallow copy) before dispatch, and re-exports `maskSearchQuery`.
- Decision recorded in `docs/decisions/0064-mask-pii-in-analytics-search-queries.md`.

## Why it looks the way it does

- **Redact, don't drop/hash.** #2043 (merged the same day) built a search report
  that needs readable query text. So dropping or hashing would gut it; we mask
  only the structured PII and keep the words. (This reconciles #2079 with #2043.)

- **Asterisk masking, not `#`.** Shannon's call on the issue: `1000` → `1**0`
  keeps first/last so an analytics reader can tell it was redacted, rather than
  an opaque `#`.

- **Scope = emails + long numbers only (Zainab's call).** Masking every word to
  catch names would turn `passport renewal` into `p******t r*****l` and destroy
  the report's value — and there's no reliable way to tell a name from a service
  term without NLP. So names are left readable and mitigated by the report only
  showing top-N frequent queries.

- **Central chokepoint in `trackEvent`.** landing's `../lib/analytics` is just
  `export * from '@govtech-bb/analytics'`, so all six search call sites use the
  same `trackEvent`. Masking there covers them all — none can forget — instead of
  editing six sites.

## Known limits (accepted, see ADR-0064)

- A free-text **name** isn't masked (no digits); top-N frequency hides one-offs.
- The digit threshold is **6+** (team decision) so form-name numbers — years
  (`cape exam registration 2024`), `under 11` — stay readable. Trade-off: a
  national ID's trailing 4-digit group (`850101-0001` → `8****1-0001`) isn't
  masked; its birthdate part still is. Contiguous long numbers (phone, NIS,
  TAMIS) are fully masked.

## Verification

- analytics package: 27 tests (mask-search-query spec + a `trackEvent` masking
  test that the caller's object is not mutated).
- `nx run-many -t build --exclude=landing` — 20 projects compile.
- landing tests (exercise the six search call sites): 236 pass.
