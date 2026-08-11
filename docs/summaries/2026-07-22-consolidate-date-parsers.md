# Session summary — Consolidate the three divergent date parsers (#2072)

**Date:** 2026-07-22 · **Branch:** `consolidate-date-parsers-2072` (off `main`) · part of #1423

## What shipped

Date parsing was reimplemented three times across the shared packages with
divergent behaviour; two of those copies had bugs. It's now one shared parser
that everyone delegates to.

- **New** `packages/expressions/src/parse-date-value.ts` —
  `parseDateValue(unknown): DateParts | null`. Handles the three input shapes
  (`{day,month,year}` object, Barbados `DD/MM/YYYY`, ISO) and applies round-trip
  validation on **every** branch. Exported from the expressions barrel (+ spec).
- `form-validation/src/rules/date.ts` `parseDate`, `expressions` `duration-since`
  and `days-between` all delegate to it, each then building its **own** date
  object in its **own** zone.
- Both reported bugs fixed; tests added for each.

## Why it looks the way it does

- **Consolidated the *parsing*, not the *date construction*.** The two packages
  deliberately use different zones — `form-validation` anchors at **UTC midnight**
  (an explicit comment defends it: matching `today()` keeps day-granular `< / >`
  comparisons from skewing 4 hours), while `expressions` uses **America/Barbados**
  for wall-clock duration/age. So the shared function returns timezone-free
  calendar parts `{year,month,day}`; each caller builds its own `Date`/`DateTime`.
  This kills the duplication and both bugs **without touching either zone
  behaviour** — the "no user effect" constraint the reviewer set.

- **Home is `@govtech-bb/expressions`.** It's already the timezone source of
  truth, and `form-validation` already depends on it (one-way arrow), so putting
  the shared parser there keeps the dependency direction clean.

- **Bug 1 (object branch accepted impossible dates).** The `{day,month,year}`
  branch of `form-validation`'s parser skipped the round-trip guard the
  `DD/MM/YYYY` branch had, so `{31,2,2020}` silently became 2 Mar and slipped
  past date comparisons. The shared `validParts` now round-trips every branch.

- **Bug 2 (`daysBetween` couldn't read the object shape).** It did
  `DateTime.fromISO(String(a))`, so a `{day,month,year}` object stringified to
  `"[object Object]"` → `NaN`. It now parses via the shared function like its
  sibling `durationSince`.

- **ISO now parsed by Luxon (strict), not native `new Date` (lenient).** The
  three copies already disagreed on ISO (native vs Luxon); standardising on Luxon
  is deterministic and stricter. Verified behaviour-preserving: every existing
  ISO test (padded date-only, bare-year `2020`) still passes. Only non-real,
  non-standard strings parse differently, and a time component (date fields don't
  emit one) is normalised to the calendar day — documented in the parser.

## Verification

- Issue's two repro tests pass (object 31-Feb → rejected; object `daysBetween` → 30).
- **Regression proof (no user effect):** all existing specs pass unchanged —
  `form-validation` 283, `expressions` 63; downstream `form-builder` 178,
  `forms` 777, `api` expressions 7.
- `nx run-many -t build --exclude=landing` — 20 projects compile; lint clean.

## Follow-ups

- The `apps/chat` app has its own `parseDate` (`coerce.ts`) — intentionally left
  out of scope (app-level coercion, different job). A future dedup could fold it
  in if it ever needs the same three-shape handling.
