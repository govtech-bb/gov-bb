# Forms UI is styled with the `@govtech-bb/styles` package

**Status:** Accepted (2026-05-27)
**Applies to:** `apps/forms` — its field renderer, form chrome composition, and any future form-facing UI.

## Context

`apps/forms` originally carried its own styling layer: form fields were rendered with `data-*` attribute hooks (`data-field`, `data-radio-item`, `data-variant`, …) and styled by hand-written CSS-module "themes" (`basic.module.css`, `govtechbb.module.css`, `template.module.css`). A build-time `VITE_DESIGN_SYSTEM` env var selected which theme to apply via `lib/design-system`. This was a bespoke adaptation layer that drifted from the official Government of Barbados design system and had to be maintained by hand.

The design-system org publishes `@govtech-bb/styles` — a CSS-first, class-based stylesheet (`govbb-*` classes, GOV.UK-style) that is the canonical source for component styling. Issue #37 asked us to adopt it directly and remove the custom adaptation layer.

A complication: `@govtech-bb/styles` ships **only** compiled CSS classes — no React components and no Tailwind `@theme`. The site chrome (header, footer, official banner) is built from `@govtech-bb/react` components whose styling depends on `@govtech-bb/design`'s Tailwind brand-token utilities (`bg-blue-100`, `text-body`, …), which the styles package cannot regenerate. So a wholesale removal of `@govtech-bb/design` / `@govtech-bb/react` was out of scope.

## Decision

**Form UI is styled with `@govtech-bb/styles` `govbb-*` classes.** New fields, validation surfaces, and form pages apply the package's classes (`govbb-form-group`, `govbb-input`, `govbb-radio`, `govbb-btn`, `govbb-text-h1`, …) directly to their markup. The compiled stylesheet is imported once as a side-effect in `src/main.tsx`.

- **No bespoke per-field CSS and no `data-*` styling contract.** Do not reintroduce attribute-hook styling or hand-rolled field CSS modules.
- **No design-system switch.** There is one design system; `VITE_DESIGN_SYSTEM`, `lib/design-system`, and the `*.module.css` themes were removed and must not return.
- **Surfaces the package does not cover** (confirmation panels, payment summary, feedback callout, the check-your-answers list, "add another" repeaters) are composed in `src/styles/govtech.css` from the package's classes plus its brand tokens (`var(--color-*)`, `var(--spacing-*)`, `var(--font-size-*)`), prefixed `form-page__*`. They must build on the design system's tokens, not invent new colours/spacing.
- **Site chrome stays on `@govtech-bb/react` + `@govtech-bb/design`.** These remain dependencies; the chrome is not rewritten onto the styles package.

## Consequences

- Adding a form field means applying the relevant `govbb-*` classes and required HTML structure (see the styles package READMEs), not writing CSS. Headings use `govbb-text-h1…h4` rather than relying on bare elements — the app's own Tailwind preflight resets bare headings, so the zero-specificity base styling in the package does not win.
- `govtech.css` keeps both `@import "@govtech-bb/design"` (for the chrome's Tailwind utilities) and the side-effect `@govtech-bb/styles` import. The styles package bundles a full Tailwind preflight + `:root` tokens; this coexists with `@govtech-bb/design`'s tokens. Watch for cascade/token collisions when touching global styling.
- When the package lacks a needed component, prefer composing from its existing classes + tokens in `govtech.css` over hand-rolled CSS. If a surface is needed across apps (e.g. the payment/feedback "blocks"), the better fix is to ship it from `@govtech-bb/styles` upstream rather than duplicate it here.
- This supersedes the multi-design-system mechanism described in `apps/forms/docs/DesignSystem.md` (now marked superseded). Full background: `docs/plans/migrate-forms-design-system.md`.
