# Severance pay calculator form — landing migration

## Goal

Add `/money-financial-support/calculate-severance-pay/form` to
`apps/landing`. A 6-step wizard that asks about employment, reason for
leaving, start/end dates, and pay, then either returns an ineligible
explanation or an eligible severance estimate (tiered weeks formula,
NIS insurable ceiling applied where it bites). Verify the existing
`start.md` renders correctly at `/money-financial-support/calculate-severance-pay/start`.
Ported from `govtech-bb/frontend-alpha:src/components/forms/calculate-severance-pay-form.tsx`.

## Approach

Reuse the existing `apps/landing/src/blocks/severance/compute.{ts,test.ts}`
— already a well-developed 156-line module with 22 passing tests covering
the tiered weeks formula, insurable ceilings (2015–2026), `completeYears`
date arithmetic, and the eligible/ineligible result shapes. The math
matches the legacy. **No changes to compute.ts.**

Rewrite `SeveranceCalculator.tsx` from scratch to match the legacy port.
The current 355-line file is partial scratch with a different `Step`
shape (discriminated union carrying parent state) and no `check`
(review) step. Replace it with the legacy's flat step state + flat
`Step` string union.

- `apps/landing/src/blocks/severance/compute.ts` — unchanged.
- `apps/landing/src/blocks/severance/compute.test.ts` — unchanged.
- `apps/landing/src/blocks/severance/SeveranceCalculator.tsx` — **full rewrite** matching the legacy 6-step wizard.
- `apps/landing/src/routes/money-financial-support.calculate-severance-pay.form.tsx` — thin route file.

Stack adaptations (NextJS → Vite/TanStack):

- Drop `"use client"`.
- Replace `useRouter().push(START_PATH)` (Back button on q-employment)
  with `useNavigate({ to: '/$', params: { _splat: 'money-financial-support/calculate-severance-pay/start' } })`
  — same splat pattern the pension and crop-over-permits forms use.
- Drop the source's `<Breadcrumbs />` on result. Landing's `Breadcrumbs`
  returns `null` on `/form` routes by design.

Date parsing:

- Port the legacy's `parseDate(parts: DateInputValue)` helper directly
  into `SeveranceCalculator.tsx` (same file, alongside the form). It
  validates day/month/year completeness, range, leap years, and returns
  a discriminated `{ ok: true; date; iso }` / `{ ok: false; reason }`
  result. Keep it inline rather than promoting to `apps/landing/src/lib/`
  — it's only used by this form, and shared-lib promotion can come if
  a second consumer appears.

Alternative considered:

- **Keep the orphaned SeveranceCalculator** and just wire it up.
  Rejected — it's missing the `check` review step and uses a different
  state-tracking shape from the legacy. Same call as PensionCalculator
  last session.

## Scope

- Rewrite `SeveranceCalculator.tsx`.
- Add the route file.
- Verify `/money-financial-support/calculate-severance-pay/start`
  renders the existing `start.md` content via the catch-all route.
- Verify the `<a data-start-link href=".../form">` in `start.md` lands
  on the new form.

Out of scope:

- Updating `start.md` content. The existing copy matches the pattern of
  other landing start pages and reads correctly.
- Analytics events on step navigation or ineligible-result variants.
  Follow-up.

## Files

Modify:

- `apps/landing/src/blocks/severance/SeveranceCalculator.tsx` (full rewrite)

Add:

- `apps/landing/src/routes/money-financial-support.calculate-severance-pay.form.tsx`

Regenerated automatically:

- `apps/landing/src/routeTree.gen.ts`

## Tests

`compute.test.ts` already covers the math (22 tests). Worth adding small
inline test cases for `parseDate` if it ends up non-trivial — e.g.
"31 February 2020" should be invalid, "29 February 2020" should be
valid (leap year). Decide during implementation.

## Verify

- `pnpm --filter @govtech-bb/landing typecheck` clean.
- `pnpm --filter @govtech-bb/landing test` — existing 22 severance tests pass.
- `pnpm --filter @govtech-bb/landing lint` clean.
- `pnpm --filter @govtech-bb/landing build` — route appears in chunk output.
- `pnpm dev:landing`, then walk:
  - `/money-financial-support/calculate-severance-pay/start` renders
    the start.md content with the "Start your estimate now" link.
  - Click through → lands on `/form` q-employment step.
  - "Yes" → q-reason → "Redundancy" → q-years (enter valid 2020-01-01
    / 2024-12-31) → q-pay (weekly, 1000) → check → result.
  - Ineligible paths: employment=Yes → self-employed ineligible.
    reason=Other → reason-not-covered ineligible. Years < 1 →
    under-one-year ineligible.
  - High pay above the year's insurable ceiling shows the ceiling-applied
    note on the eligible result.
  - "Back" on q-employment returns to `/start` via the splat catch-all.

## Open questions

- Add analytics events on step transitions and on each ineligible result
  variant (so the funnel can be measured)? Follow-up.
- Promote `parseDate` to `apps/landing/src/lib/` if/when a second form
  uses a `DateInput`. Inline for now.
