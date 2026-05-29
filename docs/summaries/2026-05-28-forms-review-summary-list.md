# Check-your-answers → govbb summary-list, payment receipt → plain `<dl>`

**Branch:** `chore/migrate-forms-design-system` (follow-on to PR #259)
**Related:** decision `docs/decisions/0007-forms-ui-styled-with-govbb-styles.md`, prior summary `2026-05-27-forms-design-system-migration.md`.

## What changed

Two semantic markup conversions in the forms app, plus a small responsive tweak:

1. **Review (check-your-answers)** → the official `govbb-summary-section` / `govbb-summary-list` pattern: each step renders a `<section>` with an `__title` (h2) + `__action` (Change link) + `<dl>` of `__row` / `__key` / `__value`. The Change link carries the step name to assistive tech via `govbb-visually-hidden`. Replaces the previous hand-rolled `<table>` markup.
2. **Post-submission payment receipts** (4 blocks in `submission-confirmation.tsx`) → semantic `<dl>` / `<dt>` / `<dd>` pairs. Kept the existing `form-page__payment-table` class and grid CSS unchanged; only the element types swap.
3. **Review container** is constrained to 2/3 width at ≥768px (was on `.form-page__review-step` before the conversion).

## Why the code looks the way it does

- **`govbb-summary-section` / `govbb-summary-list` aren't in the published `alpha.16`** (they're alpha.17-only, unreleased). Rather than wait on a release, the official `summary-list.css` was **ported into `govtech.css` under the real class names**, with its two `@apply govbb-font-*` lines swapped for the equivalent `var(--font-size-*)` declarations (the app's own Tailwind can't `@apply` the package's `@source inline` utilities). This is **forward-compatible**: when the package ships alpha.17 and the dep is bumped, that block in `govtech.css` can be deleted with no markup change. The approach matches ADR 0007's Consequence ("compose from existing classes + tokens" when the package lacks a component).

- **The payment receipt is a plain `<dl>`, not `govbb-summary-list`.** The user-pasted spec says summary-list is for answers the user can *change* (each section has a Change link). Post-submission payment data is **static reference** — there is no editing — so the spec recommends a plain definition list. The previous markup (alternating `<p>` tags inside a `form-page__payment-table` div) communicated nothing semantically; the `<dl>`/`<dt>`/`<dd>` pairs are a strict improvement that preserves the visual (Tailwind preflight zeroes `<dl>`/`<dd>` default margins, and `<dt>`/`<dd>` auto-flow into the existing `1fr 1fr` grid the same way the `<p>` pairs did).

- **Visually-hidden step context on the Change link** changes the link's accessible name from `"Change"` to `"Change Personal Details"` (etc.). The existing `getByRole("link", { name: "Change" })` assertions are updated to `{ name: /Change/ }`; a new focused test asserts the visually-hidden context is wired up (`{ name: "Change Personal Details" }`).

- **2/3 width is a restoration, not new behaviour.** The original `.formRoot .reviewStep` rule was 2/3 at ≥768px; the migration accidentally dropped it when the table became the summary-list. The constraint sits on the wrapper (`.form-page__review`) rather than each section so the divider rules (4px grey between sections, none on the last) line up across the same column width.

## Verification

- `vite build` green.
- Unit suite: **28 suites, 645 passed, 1 skipped** (the new visually-hidden test plus the existing 22 in `review.spec`; jest-axe passes on the new `<section>` / `<dl>` structure).
- Visual QA not done here (needs the backend up to load forms). Worth eyeballing the responsive layout on mobile (title → list → action stack, Change at the bottom) and ≥768px (key 1/3 + value 2/3 columns, Change top-right, last-section divider absent).
- The summary-list `:last-child` rule depends on `<section>`s being the only children of `.form-page__review` — preserved by keeping the wrapper div around the sections.
