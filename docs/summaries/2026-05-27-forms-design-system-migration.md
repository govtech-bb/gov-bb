# Forms design-system migration to `@govtech-bb/styles`

**Issue:** [#37](https://github.com/govtech-bb/gov-bb/issues/37) — Change the form builder to use the existing govbb design system.
**Branch:** `chore/migrate-forms-design-system`
**Plan:** `docs/plans/migrate-forms-design-system.md` · **Decision:** `docs/decisions/0007-forms-ui-styled-with-govbb-styles.md`

## What this was

`apps/forms` styled its fields with a bespoke layer: `data-*` attribute hooks plus hand-written CSS-module "themes" (`basic` / `govtechbb` / `template`) selected at build time by `VITE_DESIGN_SYSTEM`. We replaced that with the official `@govtech-bb/styles` package (`govbb-*` classes) and removed the switch.

## Why the approach looks the way it does

The shape of this migration was driven by several findings that aren't visible in the final diff:

- **There are three design-system packages, and they are not interchangeable.** `@govtech-bb/design` is brand *tokens* + a Tailwind `@theme`; `@govtech-bb/react` is React components built **on** those tokens (it depends on `design`); `@govtech-bb/styles` is a standalone **compiled CSS** stylesheet of `govbb-*` classes. An early instinct to "remove `@govtech-bb/design` but keep `@govtech-bb/react`" is self-contradictory — the React chrome (Footer/Logo) and the app's own header/banner JSX render through `design`'s `bg-blue-100`/`text-body` utilities, which `styles` cannot regenerate. So the chrome stays on `react` + `design`; only the form fields moved to `styles`.

- **The real "custom adaptation layer" was the app's own CSS, not `@govtech-bb/design`.** The `data-*` field styling lived in `apps/forms/src/styles/govtechbb.module.css`, consuming `design`'s tokens. That file (and the `basic`/`template` themes + the `lib/design-system` switch) is what got deleted.

- **We pinned the published `alpha.16`, which lags the repo's `main` (alpha.17).** `alpha.16` has **no** `govbb-summary-list`, `govbb-inset-text`, or `govbb-checkboxes` wrapper. So the check-your-answers/review page is composed from `govbb-text-*` + tokens (a table, not a summary list), and radio/checkbox groups get an app-level `.form-page__options` container for vertical spacing.

- **`@govtech-bb/styles` ships a full Tailwind preflight + `:root` tokens.** It's a self-contained compiled stylesheet, so it's loaded as a side-effect `import "@govtech-bb/styles"` in `main.tsx` rather than `@import`ed into the Tailwind entry. It now coexists with the app's own Tailwind (kept for the chrome) — two preflights, two token sets (same brand values).

- **Headings needed explicit `govbb-text-*` classes.** The package styles bare headings via a zero-specificity `:where(h1)` base rule, but the app's own Tailwind preflight emits `h1,h2,…{font-size:inherit}` (specificity 0,0,1), which wins — so bare `<h1>` titles rendered at body size. The fix is to apply the package's `govbb-text-h1…h4` *classes* (0,1,0) directly; they beat the preflight. (A first attempt hand-rolled the scale in `.form-page` CSS using the same tokens; switched to the package classes as the single source of truth.)

## Hand-rolled surfaces (no package equivalent)

Composed in `govtech.css` from `govbb-*` classes + brand tokens, prefixed `form-page__*`: the success/error confirmation panels, payment summary, feedback callout, the review/check-your-answers table, applicant-name block, and the show/hide disclosure (the package's `govbb-show-hide` is `<details>`-based, but the app drives a React-controlled toggle that reveals sibling fields, so its visual is hand-rolled).

Notable smaller calls: file upload keeps the **Remove** control, using the govbb dropzone markup; on repeatable field arrays, **Add Another** is `govbb-btn--link` and **Remove** is `govbb-btn--destructive-link` (matching the file-upload remove); the "Choose file" affordance is an `aria-hidden` span because the dropzone `<label>` is the accessible control.

## Verification

- `pnpm --filter @govtech-bb/forms build` — green.
- Unit suite — **620 passed, 1 skipped, 28 suites**; coverage thresholds met. Note: the default coverage run OOMs locally on Windows with multiple workers — use `--runInBand` (or raise Node heap).
- **e2e** — selectors updated (`helpers/form-page.ts` + specs) but **not run** here (needs the backend API + browsers). Run `pnpm --filter @govtech-bb/forms test:e2e` in an environment with the stack up.
- **Visual QA** — not done here (needs the backend to load forms). Watch the cascade between the styles preflight/tokens and the chrome's `@govtech-bb/design` tokens.
- **Lint** — blocked by the pre-existing ESLint 9 / `eslint-plugin-react` crash on CSS files (see `2026-05-21-forms-vite-env-hygiene.md`), unrelated to this change.
