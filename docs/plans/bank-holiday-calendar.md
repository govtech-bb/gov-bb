# Bank holiday calendar — migration to landing (Vite/TanStack)

## Goal

Add a `/bank-holiday-calendar` page to `apps/landing` that lists Barbados statutory
public holidays for a chosen year, highlights the next upcoming holiday in the
current year, and shows "in lieu" substitution days where the Public Holidays
Act, Cap. 352 rules apply. Migrated from the NextJS App Router page at
`govtech-bb/frontend-alpha:src/app/bank-holiday-calendar/page.tsx`.

## Approach

Port the source as-is in shape, but split into two layers so the date logic is
unit-testable on its own:

- `apps/landing/src/lib/bank-holidays.ts` — pure helpers (Easter algorithm,
  `addDays`, `nthWeekdayOfMonth`, `startOfDay`, `daysBetween`,
  `getBankHolidaysForYear`, and the formatting helpers). No React imports.
- `apps/landing/src/routes/bank-holiday-calendar.tsx` — the React/UI layer:
  route definition, year-param handling, layout, and all sub-components
  (`YearSwitcher`, `BankHolidaysPanel`, `NextHolidayHero`, `YearOverviewHero`,
  `HolidaySection`, `HolidayRow`, `SubstitutionNotice`, `AboutSection`).

Adapt to the Vite/TanStack stack:

- Drop `"use client"`, `useRouter`, `useSearchParams`, and the `<Suspense>` wrapper.
- Year param via TanStack: `validateSearch: z.object({ year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR).optional() })`, read with `Route.useSearch()`, write with `Route.useNavigate({ search: ... })` (using `replace: true` so back/forward isn't polluted).
- Drop the per-page `<StageBanner stage="alpha" />` block — the landing root
  layout already renders it globally via `Header.tsx`.
- Use the kebab single-form slug `/bank-holiday-calendar` to match the source.

Alternatives considered:

- **Inline all helpers in the route file** (matches source 1:1). Rejected —
  branchy substitution rules and the Easter algorithm are exactly what unit
  tests are for, and the route file would be ~700 lines.
- **Server-rendered holiday data via a loader**. Rejected — the data is
  deterministic from `year`, so client-side computation is simpler and avoids a
  needless server round-trip.

## Scope

- Add `lib/bank-holidays.ts` with all date and holiday helpers exported.
- Add `lib/bank-holidays.test.ts` covering substitution rules and known dates.
- Add `routes/bank-holiday-calendar.tsx` wiring the route, year param, and UI.
- Keep `LAST_UPDATED` as a route-file const for now (data-driven later if needed).

Out of scope:

- Government-declared one-off public holidays (the source comment notes these
  should come from CMS/data layer — same applies here).
- Analytics events on year-switcher clicks. Flagged in Open questions.
- Adding the page to `/services` or any nav. The source page isn't listed
  either; can be a follow-up.

## Files

Add:

- `apps/landing/src/lib/bank-holidays.ts`
- `apps/landing/src/lib/bank-holidays.test.ts`
- `apps/landing/src/routes/bank-holiday-calendar.tsx`

Regenerated automatically:

- `apps/landing/src/routeTree.gen.ts`

## Tests

In `lib/bank-holidays.test.ts`:

- `easterSunday` returns the known dates for a few reference years (e.g. 2024-03-31, 2025-04-20, 2026-04-05).
- `nthWeekdayOfMonth` returns the first Monday of August for a known year (Kadooment).
- `getBankHolidaysForYear` produces 12 base holidays + correct substitutes:
  - A year where 1 Jan / 21 Jan / 28 Apr / 1 May / 30 Nov / 26 Dec falls on a Sunday → Monday-in-lieu added.
  - A year where 1 Aug falls on a Sunday → Tuesday-in-lieu added.
  - A year where 1 Aug falls on a Monday → Tuesday-in-lieu added.
  - A year where 25 Dec falls on a Sunday → Tuesday-in-lieu added.
  - A year with no substitutions → list length is exactly 12.
- Results are returned sorted by date ascending.

## Verify

- `pnpm --filter @govtech-bb/landing typecheck`
- `pnpm --filter @govtech-bb/landing test`
- `pnpm --filter @govtech-bb/landing lint`
- `pnpm --filter @govtech-bb/landing dev` and check:
  - `/bank-holiday-calendar` renders the current year with the "Next bank holiday" hero.
  - `?year=2024` shows past-year overview hero and the "All bank holidays 2024" section.
  - `?year=1999` (out of range) falls back to the current year without crashing.
  - Prev/Next year buttons disable at `MIN_YEAR` / `MAX_YEAR` and update the URL via `replace`.

## Open questions

- Should year-switcher clicks emit `trackEvent` (e.g. `bank-holiday-year-prev` / `-next`)? The landing app tracks navigation events broadly — worth a one-line addition if so.
- `LAST_UPDATED` is currently a hardcoded string. Leave as-is or move to a constants file alongside other content strings? Current call: leave it inline and revisit when the page has a second update.
- Add the page to the `/services` directory listing? Source page isn't listed; treating as a follow-up unless told otherwise.
