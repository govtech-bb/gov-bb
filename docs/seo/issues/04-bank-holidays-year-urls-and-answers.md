# Bank holidays: `?year=` duplicates without canonical, and unanswered "when/is today" questions

## Problem

`/bank-holiday-calendar` is the property's most-seen page (20,630 impressions,
711 clicks, position 3.5) but converts at 3.45 % against calendar sites. The
page has no canonical, and its year switcher links to `?year=N±1` from
`MIN_YEAR` 2020 to `MAX_YEAR` 2050, so crawlers walk a 31-page chain of
near-identical pages. Search Console shows 30 `?year=` URLs (5,357
impressions); the web index holds `?year=2020` and `?year=2046`.

The demand is real and specific: "barbados bank holidays 2027" (233 + 119 +
116 impressions across variants), "emancipation day barbados 2026" (429, 9
clicks), "is today a bank holiday in barbados" (197, 4 clicks), "is tomorrow a
holiday in barbados" (83, 0), "holidays in barbados 2026" (428). The page
answers none of these in its first lines or its snippet.

## Impact

Duplicate signals split across 31 URLs; the failed "duplicate without
user-selected canonical" validation in Search Console; a 3.45 % CTR on 20k
impressions where a year-specific title and an answer-first line would
plausibly double clicks.

## Where

- `apps/landing/src/routes/bank-holiday-calendar/index.tsx`: `head()` (lines
  ~29–38, `pageHead` without `path`), `YearSwitcher` (lines ~122–220).
- `apps/landing/src/lib/bank-holidays.ts`: `MIN_YEAR = 2020`, `MAX_YEAR = 2050`.
- `apps/landing/src/routes/bank-holiday-calendar/-meta.ts`: title "Check bank
  holiday dates" (differs from the rendered title).

## Fix

1. **Canonical policy.** Treat a small window as real pages and everything
   else as the base page:
   - years in `[currentYear − 1, currentYear + 2]`: self-canonical
     `/bank-holiday-calendar?year=YYYY`, title `Bank holidays in Barbados YYYY
| Government of Barbados`, description naming the year and the count of
     holidays;
   - the base URL: canonical to itself, title for the current year;
   - any other year: canonical to the base URL (or redirect to it) and no
     inbound links — shrink `MIN_YEAR`/`MAX_YEAR` or clamp the switcher to the
     window.
2. **Answer-first line** under the h1, server-rendered: "Today is not a bank
   holiday. The next bank holiday is Independence Day, Monday 30 November
   2026." (or "Today is a bank holiday: …"). This is what "is today / is
   tomorrow" queries and AI answers extract.
3. **Per-holiday dated lines** in the list ("Emancipation Day — Saturday 1
   August 2026, observed Monday 3 August") so single-holiday queries match.
4. Keep `pageHead` as the single head helper; pass `path` and the year-aware
   title/description.

## Acceptance criteria

- `?year=2046` canonicalises to `/bank-holiday-calendar` (or redirects);
  `?year=2027` is self-canonical with a year-specific title.
- The switcher never links outside the window.
- The rendered page contains the answer-first line and a dated line per
  holiday; the `-meta.ts` title matches the rendered title.
- Head test asserts canonical + title for base, in-window and out-of-window
  years.
- Search Console: `?year=` URLs outside the window disappear from the Pages
  report; CTR on the base page measured before/after.

Suggested labels: `enhancement`, `severity:important`, `area:frontend`, `subsystem:landing`
