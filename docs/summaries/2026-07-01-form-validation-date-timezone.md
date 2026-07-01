# Form-validation date rules compute "today" in Barbados, not UTC

**Issue:** [#1825](https://github.com/govtech-bb/gov-bb/issues/1825) — [Bug]
Timezone mismatch in form-validation date rules (UTC) vs. expressions
(America/Barbados).

## What changed

- `packages/form-validation/src/rules/date.ts` — `today()` now derives the
  Barbados calendar date via Luxon (`DateTime.now().setZone(DEFAULT_ZONE)`) and
  rebuilds it at UTC midnight. The four runners (`pastRunner`,
  `pastOrTodayRunner`, `futureRunner`, `futureOrTodayRunner`) are unchanged.
- `packages/form-validation/package.json` — added `luxon` + `@types/luxon`.
- `packages/form-validation/src/rules/date.spec.ts` — froze the clock so the
  today-relative tests are deterministic, and added a describe covering the
  Barbados-vs-UTC evening window.

## Why it looks the way it does

**UTC-midnight anchoring, not `startOf("day").toJSDate()`.** The issue's
suggested snippet anchored "today" at Barbados midnight (04:00 UTC), but
submitted dates are anchored at UTC midnight by `parseDate`. Mixing the two puts
a 4-hour gap into every `<` / `>` comparison — `pastRunner` would then wrongly
accept a date that is actually today. So we take the Barbados *calendar date*
(`now.year/month/day`) and rebuild it with `Date.UTC(...)`: right clock, right
anchoring. This subtlety is recorded in ADR 0058.

**Luxon direct, not reuse of `expressions.today()`.** The cleaner option was
`parseDate(expressionsToday())` — no new dependency, single source of truth for
the zone. We chose the direct `luxon` + `DEFAULT_ZONE` route because the user
wanted to follow the issue's described fix. Tradeoff: `DEFAULT_ZONE` is now known
in two packages. Noted as a future consolidation option, not done here.

**Froze the test clock.** The tests previously computed `todayStr` from the real
UTC clock, so they were timezone-fragile and could themselves flake in the very
window this bug is about. `vi.setSystemTime` at noon UTC (where UTC and Barbados
dates coincide) makes the existing assertions deterministic; a separate describe
freezes at `2026-07-01T02:00Z` (= Barbados 2026-06-30 22:00) to pin the window.

## What we almost got wrong

Started the branch off local `main`, which turned out to be **2462 commits
behind `origin/main`** — an entirely different file layout where the planned
`today()` didn't exist. Caught it before editing, reset the branch onto
`origin/main` (the true trunk, which carries the bug), and continued.

## Open questions

None. If the team later wants a single source of truth for the zone, `today()`
can switch to reusing `expressions.today()`.
