# Crop Over permits form — migration to landing (Vite/TanStack)

## Goal

Add a `/business-trade/crop-over-permits/form` page to `apps/landing`. The page
is a 5-step wizard that asks about a Crop Over event (type, venue, expected
size, features) and returns a filtered checklist of permits the organiser
needs, ordered by application sequence and tagged with urgency. Ported from
`govtech-bb/frontend-alpha:src/components/forms/crop-over-permits-form.tsx`.

## Approach

Mirror the existing `apps/landing/src/blocks/pension/` and `.../severance/`
pattern: pure logic in a `compute.ts` next to a unit-test file, data in
`permits.ts`, React/UI in `CropOverPermitsForm.tsx`, and a thin route file
that mounts the component.

- `apps/landing/src/blocks/crop-over-permits/permits.ts` — `PERMITS` array,
  `Permit`, `FeatureFlag`, `VenueFlag`, `UrgencyLevel`, `ApplyInPerson`
  types. No React.
- `apps/landing/src/blocks/crop-over-permits/compute.ts` — `getActivePermits`
  (filters `PERMITS` by venue + feature flags) and `renumberSteps`
  (collapses shared `step` values into sequential display numbers).
- `apps/landing/src/blocks/crop-over-permits/compute.test.ts` — vitest
  coverage for both pure functions.
- `apps/landing/src/blocks/crop-over-permits/CropOverPermitsForm.tsx` — the
  wizard UI with all five steps.
- `apps/landing/src/routes/business-trade.crop-over-permits.form.tsx` — route
  file that mounts the component. TanStack file routing converts dots to
  slashes, so this maps to `/business-trade/crop-over-permits/form`.

Stack adaptations (NextJS → Vite/TanStack):

- Drop `"use client"`.
- Replace `useRouter().push(SERVICE_PATH)` with TanStack `<Link>` or
  `useNavigate()`. The Previous button on q-event navigates back to
  `/business-trade/crop-over-permits` (the service root).
- Drop the source's `<Breadcrumbs />` render on the result step. Landing's
  `Breadcrumbs` returns `null` for `/form` routes by design (focused form
  pages); we honour that convention.

Alternatives considered:

- **All-in-one route file** (like bank-holiday-calendar). Rejected — the
  permit-filter rules and step-renumbering benefit from unit tests, and
  the PERMITS data is naturally a separate concern.
- **Convert to apps/forms dynamic schema**. Rejected — this isn't a
  submission form. It's a client-side rules engine that filters a static
  permit dataset, and the dynamic form runtime doesn't support that shape.

## Scope

- Port the wizard component, data, and pure logic.
- Add tests for `getActivePermits` and `renumberSteps`.
- Wire up the route at the legacy nested path.
- Verify the existing `<a data-start-link href="/business-trade/crop-over-permits/form">`
  in `apps/landing/src/content/crop-over-permits/index.md` resolves correctly.

Out of scope:

- The "Save as PDF" button uses `window.print()` after force-opening all
  `<details>` elements. Kept verbatim — no improvements.
- Wiring up the orphaned `blocks/pension/` and `blocks/severance/`
  components. Out of scope.
- Analytics events on step navigation. Follow-up.

## Files

Add:

- `apps/landing/src/blocks/crop-over-permits/permits.ts`
- `apps/landing/src/blocks/crop-over-permits/compute.ts`
- `apps/landing/src/blocks/crop-over-permits/compute.test.ts`
- `apps/landing/src/blocks/crop-over-permits/CropOverPermitsForm.tsx`
- `apps/landing/src/routes/business-trade.crop-over-permits.form.tsx`

Regenerated automatically:

- `apps/landing/src/routeTree.gen.ts`

## Tests

In `blocks/crop-over-permits/compute.test.ts`:

- `getActivePermits`:
  - Returns permits with empty `conditions` (always-on) regardless of input.
  - Filters in a beach-only permit when `venue === 'beach'`, out when `venue === 'private'`.
  - Filters in a permit with multiple conditions only when *all* are satisfied
    (e.g. `['beach', 'alcohol']` requires both).
  - Cruise event path: `venue === 'water'` plus features works the same as
    other venues (no special-case branch in `getActivePermits`).
- `renumberSteps`:
  - Sequential steps `[1, 2, 3]` → display numbers `[1, 2, 3]`.
  - Consecutive permits sharing the same `step` value get the same display
    number; the counter only advances when `step` changes.
  - Empty input returns empty array.

## Verify

- `pnpm --filter @govtech-bb/landing typecheck` clean (excluding the
  pre-existing `src/content/registry.ts:58` gray-matter error).
- `pnpm --filter @govtech-bb/landing test` — new tests pass.
- `pnpm --filter @govtech-bb/landing lint` clean.
- `pnpm --filter @govtech-bb/landing build` — route appears in chunk output.
- `pnpm --filter @govtech-bb/landing dev`, then:
  - Visit `/business-trade/crop-over-permits/form` — q-event step renders.
  - Submit without selecting → error summary appears.
  - Select "A boat cruise" → q-venue is skipped, lands on q-size.
  - Walk through to result → permits filter correctly by venue + features.
  - "Save checklist as PDF" opens the browser print dialog.
  - The `Start now` link in `/crop-over-permits` lands on the form.

## Open questions

- Add analytics events on step transitions and feature toggles? The landing
  app tracks navigation broadly — worth a follow-up issue if not done here.
- Should this work also wire up the orphaned `blocks/pension/` and
  `blocks/severance/` components, given they have the same migration shape?
  Out of scope for this change but worth filing.
- Print stylesheet: the source has no dedicated `@media print` CSS — it
  relies on browser defaults plus `print:hidden` Tailwind utilities. Leave
  as-is for the migration; revisit if PDF output looks rough.
