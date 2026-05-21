# Pension calculator form — landing migration

## Goal

Add `/pensions-and-gratuities/calculate-your-pension/form` to
`apps/landing`. A two-input pension calculator (months of pensionable
service, last annual salary) that returns full pension annual/monthly,
reduced pension annual/monthly, and gratuity lump sum, with conditional
service-warning copy. Reference content below — formulas, retirement
rules, NIS contact, sources — ports verbatim. Mirrors the
crop-over-permits form pattern. Ported from
`govtech-bb/frontend-alpha:src/components/forms/calculate-your-pension-form.tsx`.

## Approach

Reuse the existing `apps/landing/src/blocks/pension/compute.{ts,test.ts}`
— the math matches the legacy source exactly (5 tests already passing).
Rewrite `PensionCalculator.tsx` from scratch to match the legacy UI
using `@govtech-bb/react` components; the current file is orphaned
scratch that doesn't follow the design system. Add a thin route file
that mounts the component.

- `apps/landing/src/blocks/pension/compute.ts` — unchanged.
- `apps/landing/src/blocks/pension/compute.test.ts` — unchanged.
- `apps/landing/src/blocks/pension/PensionCalculator.tsx` — **full rewrite** to match the legacy port (Heading/Input/Button/ErrorSummary/ShowHide/Text), result card layout with teal/green tones, formula reference section, ShowHide collapsibles for retirement details, NIS contact, sources.
- `apps/landing/src/routes/pensions-and-gratuities.calculate-your-pension.form.tsx` — route file that mounts the component.

Stack adaptations:

- Drop `"use client"`.
- Replace `useRouter().push(SERVICE_PATH)` (Back button) with
  `useNavigate({ to: '/$', params: { _splat: 'pensions-and-gratuities/calculate-your-pension' } })`
  — same splat pattern the crop-over-permits form uses, since the
  service root resolves through landing's catch-all `/$` route.
- Drop the source's `<Breadcrumbs />` at the top. Landing's
  `Breadcrumbs` returns `null` on `/form` routes by design.

Money input mask:

- **Skip `@maskito/react`** from the legacy. The user types a plain
  number; we strip commas on submit (`Number.parseFloat(salaryRaw.replace(/,/g, ''))`).
  The formatted result still uses `Intl.NumberFormat`. Avoids a new
  dep; UX delta is the lack of as-you-type comma grouping.

Alternative considered:

- **Just wire up the existing orphaned `PensionCalculator.tsx`.**
  Rejected — it uses raw HTML elements and arbitrary CSS vars (e.g.
  `var(--lagoon-deep,#0a5e6b)`), not the design system. Shipping it
  as-is would be a visual regression from the legacy site.

## Scope

- Rewrite `PensionCalculator.tsx`.
- Add the route file.
- Verify the existing `<a data-start-link href="/pensions-and-gratuities/calculate-your-pension/form">`
  in `apps/landing/src/content/calculate-your-pension/index.md` resolves correctly.

Out of scope:

- Wiring up the orphaned `blocks/severance/` (same pattern; separate
  session).
- Adding `@maskito/react`. Filed as a follow-up if as-you-type masking
  is wanted later.
- Analytics events. Follow-up.

## Files

Modify:

- `apps/landing/src/blocks/pension/PensionCalculator.tsx` (full rewrite)

Add:

- `apps/landing/src/routes/pensions-and-gratuities.calculate-your-pension.form.tsx`

Regenerated automatically:

- `apps/landing/src/routeTree.gen.ts`

## Tests

`compute.test.ts` already covers the math. No new tests needed unless
something during implementation surfaces logic worth pinning down
(e.g. the comma-strip parsing).

## Verify

- `pnpm --filter @govtech-bb/landing typecheck` clean.
- `pnpm --filter @govtech-bb/landing test` — existing 5 pension tests pass.
- `pnpm --filter @govtech-bb/landing lint` clean.
- `pnpm --filter @govtech-bb/landing build` — route appears in chunk output.
- `pnpm dev:landing`, then walk the form end to end:
  - Visit `/pensions-and-gratuities/calculate-your-pension/form`.
  - Submit empty → ErrorSummary with two errors.
  - Enter `240` months + `60000` salary → result shows full annual
    `BDS$24,000.00`, gratuity `BDS$75,000.00`.
  - Enter `119` months → service warning banner appears.
  - "Recalculate" clears the form and scrolls to top.
  - "Back" navigates to `/pensions-and-gratuities/calculate-your-pension`.
  - "Start now" link in the content page lands on the form.

## Open questions

- Add `@maskito/react` later if as-you-type comma grouping in the
  salary input is wanted. Worth a follow-up issue if anyone cares.
- Analytics on calculate-success / service-warning displays. Follow-up.
