# Severance pay calculator form — landing migration

Ported the 5-step severance pay wizard from frontend-alpha to
`apps/landing` at `/money-financial-support/calculate-severance-pay/form`,
along with two real bugs found along the way.

## Shape

Mirrors the established blocks pattern (pension, crop-over-permits):

- `apps/landing/src/blocks/severance/compute.ts` — pure logic
  (`completeYears`, `avgWeeklyFromSimple`, `tieredWeeks`,
  `calculateSeverance`, NIS insurable ceilings 2015–2026).
- `apps/landing/src/blocks/severance/compute.test.ts` — 24 vitest
  cases including new 2-year boundary cases.
- `apps/landing/src/blocks/severance/SeveranceCalculator.tsx` —
  5-step wizard UI: employment → reason → dates → pay → result.
  Inline `parseDate` helper for the `DateInput` parts. Result page
  branches into 3 ineligible variants or an eligible breakdown with
  the NIS insurable-ceiling note, tiered weeks formula
  (2.5/3.0/3.5 weeks per year), the 104-week gap-weeks visual
  example, and "what happens after you file" guidance.
- `apps/landing/src/routes/money-financial-support.calculate-severance-pay.form.tsx`
  — thin route file mounting the component.

## What the plan got wrong

The plan said "compute.ts is well-developed, 22 passing tests, reusable
as-is." That was wrong on closer inspection. Two real bugs:

**Wrong eligibility threshold.** `compute.ts` returned ineligible at
`years < 1` with reason `"under-one-year"`. The Severance Payments Act
(Cap. 355A) requires **2 years** of continuous service, and the
existing `start.md` even says "at least **2 years**" — so the code
contradicted our own copy. Fixed: `years < 2` with reason
`"under-two-years"`. Two new boundary tests pin the change down
(1-year-but-not-2 still ineligible; exactly-2 eligible).

**Stale label strings.** `ReasonLabel` had "Lay-off lasting more than
13 weeks" but the legacy and live site use "I was laid off (period of
6 months)". Several other label strings were similarly drifted. Updated
to match the legacy.

These were called out before I cut UI code and confirmed with the user
as scope expansion before proceeding.

## Live flow ≠ source flow

The legacy source declares a 6-step `Step` union including a `"check"`
review step — but the rendering for that step is **commented out** in
the source. The actual live alpha flow is 5 steps. Matched the live
behaviour and removed `"check"` from the `Step` union entirely. If
that ever needs to come back, the legacy comment is the reference.

## Other bugs surfaced

**Missing frontmatter category.** `apps/landing/src/content/calculate-severance-pay/start.md`
was missing `category: money-financial-support`, so the registry
couldn't compute the right URL and the `/start` page 404'd through
the catch-all route. Fixed in this PR. (Adjacent files like
`index.md` had it; `start.md` did not.)

## Stack adaptations (NextJS → Vite/TanStack)

- Drop `"use client"`.
- `useRouter().push(START_PATH)` (Back button on q-employment) →
  `useNavigate({ to: '/$', params: { _splat: 'money-financial-support/calculate-severance-pay/start' } })`.
  Same splat catch-all pattern the pension and crop-over-permits forms
  use to navigate back to the service root or start page.
- Drop the source's `<Breadcrumbs />` on the result step. Landing's
  `Breadcrumbs` returns `null` on `/form` routes by design.
- Skip `@maskito/react` for the pay input. Strip commas on submit
  (`simpleAvg.replace(/,/g, '').trim()`). Same call as the pension
  form. UX delta: no as-you-type comma grouping.

## Files

- `apps/landing/src/blocks/severance/SeveranceCalculator.tsx` (rewrite)
- `apps/landing/src/blocks/severance/compute.ts` (threshold + labels)
- `apps/landing/src/blocks/severance/compute.test.ts` (boundary cases)
- `apps/landing/src/content/calculate-severance-pay/start.md` (frontmatter fix)
- `apps/landing/src/routes/money-financial-support.calculate-severance-pay.form.tsx` (new)
- `apps/landing/src/routeTree.gen.ts` (regenerated)
- `docs/plans/calculate-severance-pay-form.md` (the plan that drove this)

PR: https://github.com/govtech-bb/gov-bb/pull/77 → `dev`.
