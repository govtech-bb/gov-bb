# Analytics form page: standardized header + date-range filter

**Date:** 2026-07-12
**App:** `apps/analytics`

## Problem

The homepage (`AnalyticsPage`) has a Date range selector in its header; the
per-form detail page (`FormPage`) does not. A user viewing one form's funnel /
per-step / submit-reliability data is stuck on whatever range the link carried
and cannot re-filter. The `$formId` route already validates and reacts to a
`?range=` search param and `FormDetailData` already carries `range` — the only
missing piece is the UI control on the form page.

Separately, the "Top journeys" section on the form page is being retired.

## Goals

1. The form detail page can be filtered by the same date range as the homepage,
   via a shared header component.
2. The selected range lives in the URL (`?range=`, already wired) so the page
   stays a shareable link.
3. Remove the "Top journeys" section from the form detail page.

Out of scope: the `journey` field stays on `FormDetailData` and the
`umami-server` fetch — only the UI section is removed (easy to re-add later).

## Design

### New shared component — `src/components/AnalyticsHeader.tsx`

Renders the standard page header for both analytics pages:

- Title (`h1`)
- Optional subtitle (`Text` caption) — homepage: visitors/pageviews line;
  form page: the `formId`
- Optional `← All forms` back-link above the title (`backTo`)
- The Date range `Select` (options from `RANGE_OPTIONS`), disabled while a
  navigation loader runs, with an inline "Updating…" `Spinner`
- The `FreshnessBanner`

Props:

```
title: string
subtitle?: ReactNode
backTo?: string                 // renders the back-link when set
range: string
window: string
generatedAt: string
to: string                      // navigation target for range change
params?: Record<string, string> // route params for `to`
```

On range change it calls `navigate({ to, params, search: { range } })`. The
`Spinner` component and loading state (`useRouterState`) move into this
component from `AnalyticsPage`.

### `AnalyticsPage.tsx`

Replace the inline `<header>` block with `<AnalyticsHeader>`:

- `subtitle` = the visitors · pageviews line
- `to="/"`, no `params`, no `backTo`

Remove the now-duplicated `Select`/`Spinner`/loading markup from the header.
The page still reads `isLoading` for the `aria-busy` body dimming (keep that).
Update the "Forms" section blurb and the "Forms — how it works" popover copy to
stop mentioning "journeys".

### `FormPage.tsx`

Replace the inline back-link + `<header>` with `<AnalyticsHeader>`:

- `subtitle={detail.formId}`
- `backTo="/"`
- `to="/analytics/forms/$formId"`, `params={{ formId: detail.formId }}`
- `range/window/generatedAt` from `detail`

Delete the `Journeys` component and its `<Journeys />` call.

## Verification

- `pnpm exec nx run analytics:build` compiles.
- `pnpm exec nx run analytics:test` passes (update `FormPage.test.tsx` /
  `AnalyticsPage.test.tsx` if they assert on journeys or header markup).
- Drive the form page: changing the Date range re-fetches that form's detail;
  the URL updates to `?range=`; "Top journeys" is gone; back-link returns to the
  homepage preserving range.
