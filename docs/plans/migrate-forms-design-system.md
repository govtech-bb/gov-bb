# Migrate the forms app to the GOV.BB styles package

**Issue:** [govtech-bb/gov-bb#37](https://github.com/govtech-bb/gov-bb/issues/37) — _Change form builder to use the existing govbb design system_
**Branch:** `chore/migrate-forms-design-system`
**Scope:** `apps/forms` only.

## Goal

Replace the forms app's hand-rolled styling — a custom `data-*` + CSS-module "design system" with a build-time switch (`VITE_DESIGN_SYSTEM`) — with the official **`@govtech-bb/styles`** CSS-first design system (`govbb-*` classes). After this change the forms app's appearance tracks the GOV.BB design system directly, with no bespoke adaptation layer.

## Approach

**Keep the existing component structure and restyle it** by applying `@govtech-bb/styles` `govbb-*` classes to the current markup, adjusting structure only where a govbb component requires it (e.g. wrapping an input in `govbb-form-group` → `govbb-input-wrapper` → `govbb-input`). Surfaces the package has no class for are **hand-rolled in-app** using `govbb-*` classes plus the brand tokens the styles dist ships as `:root` CSS variables (`var(--color-*)`, `var(--spacing-*)`, …).

**The site chrome stays as-is.** The Official banner, Header/Logo, and Footer remain `@govtech-bb/react` components styled via `@govtech-bb/design` brand-token Tailwind utilities (`bg-blue-100`, `text-body`, …). So `govtech.css` imports **both** `@govtech-bb/design` (chrome) and `@govtech-bb/styles` (form surfaces).

### Alternatives considered and rejected

- **Swap form fields to `@govtech-bb/react` components** (`Input`, `Radio`, …) — rejected: more invasive, introduces TanStack Form integration risk, and mixes a second styling mechanism into the field layer.
- **Publish the `payment`/`feedback-box` blocks upstream and import them** — rejected for simplicity: they're ~80 lines of plain CSS, so hand-rolling keeps this to a single repo / single PR with no cross-repo release dependency.
- **Remove `@govtech-bb/design` and rebuild the chrome on styles classes** — rejected: the chrome works and is out of scope; dropping design would break the chrome's Tailwind utilities.

## Element mapping (`data-*` / module class → `govbb-*`)

| Surface (current) | Target structure / classes |
|---|---|
| Field wrapper (`data-field`) | `div.govbb-form-group` (order: label, hint, error, control) |
| Label (`<label>`) | `label.govbb-label` (`for`) |
| Hint (`data-hint`) | `p.govbb-hint` (wire `aria-describedby`) |
| Inline error (`data-error`) | `p.govbb-error-message` (`role="alert"`; set `aria-invalid` on control) |
| Text/number/tel/email input | `input.govbb-input` inside `div.govbb-input-wrapper` |
| Textarea | `textarea.govbb-textarea` inside `govbb-input-wrapper` |
| Select (`data-select-field`) | `select.govbb-select` inside `div.govbb-select-wrapper` + decorative `span.govbb-select__chevron` |
| Checkbox — single | `div.govbb-checkbox-item` > `input.govbb-checkbox` + `label.govbb-checkbox-item__label` |
| Checkbox — group | `fieldset.govbb-fieldset` > `legend.govbb-fieldset__legend` + `div.govbb-checkboxes` > items |
| Radio group | `fieldset.govbb-fieldset` > `legend.govbb-fieldset__legend` + `div.govbb-radio-item` (`input.govbb-radio` + `label.govbb-radio-item__label`) |
| Radio conditional reveal (`data-radio-conditional`) | `div.govbb-radio-item__conditional` as sibling after the `govbb-radio-item` (used for visual treatment; React keeps controlling visibility — see Structural notes) |
| Date (`data-date-*`) | `fieldset.govbb-fieldset` > `div.govbb-date-input` > three `div.govbb-date-input__part` (`__label` + `div.govbb-date-input-wrapper`[`--year`] + `input.govbb-date-input__field`) |
| File upload (`data-file-upload-*`) | `div.govbb-file-upload` > `label.govbb-file-upload__dropzone` (`__info` > `__title`/`__subtitle`, `input.govbb-file-upload__input`, `__action` > `span.govbb-btn--tertiary` + `__max-size`) + `ul.govbb-file-upload__list` > `li.govbb-file-upload__item` > `span.govbb-file-upload__name` + `button.govbb-btn--destructive-link` (**Remove kept**) |
| Show/hide (`data-show-hide-*`) | `govbb-show-hide*` classes on the existing controlled `<button>` structure (see Structural notes) |
| Error summary (`data-error-summary`) | `div.govbb-error-summary` (`role="alert"`) > `h2.govbb-error-summary__title` + `ul.govbb-error-summary__list` > `li` > `a.govbb-error-summary__link` |
| Buttons (`data-variant`) | primary `govbb-btn`; secondary `govbb-btn--secondary` (Previous); link `govbb-btn--link`; destructive-link `govbb-btn--destructive-link`; nav group `govbb-btn-group` |
| Headings / body text | global base styles handle `h1–h6`/`p`; explicit `govbb-text-*` where needed |
| Review "Change" link | `a.govbb-link` |
| Next-steps `<ul>` | `ul.govbb-list` / `govbb-list--bullet` |

## Hand-rolled surfaces (no govbb class — build from govbb classes + tokens)

- **Check-your-answers / review** (`review.tsx`): `dl.govbb-summary-list` > `govbb-summary-list__row` > `dt.govbb-summary-list__key` + `dd.govbb-summary-list__value`, grouped in `section.govbb-summary-section` (`__title` + `__action` with `govbb-link` "Change"). _Note: `summary-list` is a real govbb component, so this is a markup change (table → `dl`), not pure hand-roll._
- **Success / error confirmation panels** (`submission-confirmation.tsx`): no panel component exists (`status-banner` is lifecycle-only; `inset-text` README forbids success/error use). Hand-roll with `govbb-text-*` + brand tokens (`var(--color-teal-40)` success, `var(--color-red-40)` error).
- **Payment summary**: hand-roll mirroring the `govbb-payment` block visual using `govbb-text-*` + tokens.
- **Feedback callout**: hand-roll yellow callout (`var(--color-yellow-40)` bg, `var(--color-yellow-100)` border) + `govbb-text-*` + `govbb-btn--secondary`.
- **Applicant-name display** (`applicant-name-display.tsx`): plain `govbb-text-*`.
- **Form-error / not-found pages**: `govbb-text-*` headings + `govbb-btn` / `govbb-link` + `govbb-list`.
- **Service-title caption** + **form layout** (`formRoot`/`formStep`/`formNavigation`): small app-level CSS (flex/gap/border) composed with `govbb-text-*`, following the official template pattern.

## Files

**Modify**
- `apps/forms/package.json` — add `@govtech-bb/styles` (alpha) dependency.
- `apps/forms/src/styles/govtech.css` — add `@import "@govtech-bb/styles"`; keep `@import "@govtech-bb/design"` + the `@source` for `@govtech-bb/react/dist` (chrome); house the retained app-level layout + hand-rolled-surface CSS (or a sibling stylesheet).
- `apps/forms/src/components/field-renderer.tsx` — rewrite all field markup to govbb classes/structure.
- `apps/forms/src/components/form-renderer.tsx` — drop `import designSystem from "../lib/design-system"`; replace `formRoot`/`formTitle`/`formStep`/`formStepDescription`/`formNavigation` with govbb text classes + app layout; nav buttons → `govbb-btn*`.
- `apps/forms/src/components/review.tsx` — drop the design-system import; table → `govbb-summary-list`/`govbb-summary-section`; "Change" → `govbb-link`.
- `apps/forms/src/components/submission-confirmation.tsx` — drop `govtechbb.module.css`; rebuild panels/payment/feedback/next-steps/contact with govbb classes + tokens.
- `apps/forms/src/components/error-message.tsx` — `data-error` → `govbb-error-message`.
- `apps/forms/src/components/error-summary.tsx` — `data-error-summary` → `govbb-error-summary` structure.
- `apps/forms/src/components/file-upload.tsx` — `data-file-upload-*` → `govbb-file-upload*` (keep Remove via `govbb-btn--destructive-link`).
- `apps/forms/src/components/applicant-name-display.tsx`, `form-error.tsx`, `not-found.tsx` — apply govbb classes.
- Spec files: `field-renderer.spec.tsx`, `form-renderer.spec.tsx`, `error-message.spec.tsx`, `error-summary.spec.tsx`, `file-upload.spec.tsx`, `review.spec.tsx`, `submission-confirmation.spec.tsx`, `not-found.spec.tsx`, `__root.spec.tsx` — update assertions from `data-*`/module classes to `govbb-*`.
- Playwright e2e (`apps/forms/e2e/**`) — update selectors that target `data-*`/module classes.

**Delete**
- `apps/forms/src/lib/design-system/index.ts`
- `apps/forms/src/styles/basic.module.css`
- `apps/forms/src/styles/govtechbb.module.css`
- `apps/forms/src/styles/template.module.css` _(if unused — confirm)_
- `apps/forms/src/styles/index.css` _(empty + unimported — confirm)_

**Unchanged (chrome)**
- `apps/forms/src/components/official-banner.tsx`, `site-header.tsx`, `routes/__root.tsx` — stay on `@govtech-bb/react` + `@govtech-bb/design`.

## Structural notes (carry into implementation)

- **Show/hide**: the govbb component assumes native `<details>/<summary>`, but the app uses a controlled `<button aria-expanded>` because the toggle drives sibling form fields and form state. Keep the controlled structure and apply `govbb-show-hide*` classes for visual parity; hand-roll with tokens if the govbb selectors require `<details>`.
- **Radio conditional reveal**: govbb's `govbb-radio-item__conditional` is CSS-toggled on `:checked`. The app already controls visibility in React (renders inset fields only when selected). Apply the class for the visual treatment (indent + left border) and let React continue to own visibility; ensure the two don't conflict.
- **File upload markup**: the README example and the `test.html` snippet differ on the Remove control. Treat the provided `test.html` (with `govbb-btn--destructive-link`) as the target, but confirm against the installed package version.
- **`VITE_DESIGN_SYSTEM`**: grep the whole repo (env files, `amplify.yml`, e2e, docs) and remove every reference, not just `lib/design-system`.

## Verify

- `pnpm --filter @govtech-bb/forms build` — Vite build passes.
- `pnpm --filter @govtech-bb/forms lint` — clean.
- `pnpm --filter @govtech-bb/forms test` — Jest unit suite green (after spec updates).
- `pnpm --filter @govtech-bb/forms test:e2e` — Playwright green (after selector updates).
- `pnpm --filter @govtech-bb/forms dev` — manual pass over: every field type, hint/error states, error summary, radio conditional reveal, show/hide, file upload (add + remove), check-your-answers, submission confirmation (success / error / payment-pending / payment-success / payment-failed), feedback callout, declaration/applicant-name, form-error + not-found pages. Confirm the chrome (banner/header/footer) is visually unchanged.
- Confirm no clashes between the styles dist's global base styles (`html`/`body`/`h1–h6`) and `:root` token duplication vs `@govtech-bb/design` used by the chrome.

## Open questions / to confirm during implementation

1. Which `@govtech-bb/styles@alpha` version to pin.
2. Exact installed `govbb-file-upload` markup (README vs `test.html` Remove-button discrepancy).
3. That global base styles from the styles dist don't restyle the chrome unexpectedly (font/heading collisions) and that duplicated `:root` tokens between `styles` and `design` agree.
4. Confirm `template.module.css` and `index.css` are dead before deleting.
5. Whether any deployment config (`amplify.yml`) sets `VITE_DESIGN_SYSTEM` and needs cleanup.
