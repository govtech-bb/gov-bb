# Improve accessibility in the forms app (#37 umbrella, folds in #321)

## Context

Several pre-existing accessibility gaps in `apps/forms` became visible during
the `@govtech-bb/styles` migration ([#259](https://github.com/govtech-bb/gov-bb/pull/259),
ADR `0007-forms-ui-styled-with-govbb-styles`). This session closed three of them
in one branch (`forms-a11y`, targets `sandbox`):

1. **No skip-to-content link** — WCAG 2.4.1 (Bypass Blocks), folded in from
   [#321](https://github.com/govtech-bb/gov-bb/issues/321).
2. **Show/hide was a hand-rolled `<button>`** instead of the native
   `<details>`/`<summary>` the `govbb-show-hide` component is built on.
3. **Latent textarea fall-through** — a `fieldArray` textarea rendered as a
   single-line `<input>`.

## What we did

- **Skip link** (`routes/__root.tsx`, `styles/govtech.css`) — added
  `<a href="#main-content" class="skip-link">` as the first element in the root
  layout and `id="main-content"` + `tabIndex={-1}` on `<main>`. `.skip-link` is
  clipped out of view but kept in the tab order; on `:focus` it becomes a clean
  full-width band at the top of the page.
- **Show/hide → native `<details>`** (`components/form-renderer.tsx`,
  `components/field-renderer.tsx`, `styles/govtech.css`) — the whole disclosure
  is now rendered by `form-renderer` as `<details class="govbb-show-hide">` with
  a `<summary>` and the controlled fields nested in `govbb-show-hide__content`.
  The `show-hide` case was deleted from `field-renderer`, and the hand-rolled
  `.form-page__show-hide*` CSS was removed in favour of the package classes.
- **Textarea fall-through** (`components/field-renderer.tsx`) — `case "textarea"`
  now handles the `fieldArray` path (Add Another / Remove, mirroring the text
  case) and always returns, so it can never fall into `case "text"`.
- **Tests** — `jest-axe` audits on all three changed components, a skip-link
  ordering/target test in `__root.spec.tsx`, rewritten show-hide tests asserting
  the `<details>` disclosure, and a textarea-`fieldArray` regression suite.
  Forms suite: 708 passed / 1 skipped, coverage thresholds met; `forms:build`
  clean.

## Why we did it that way

- **The skip link's target needed `tabIndex={-1}`, not just an `id`.** Without a
  focusable `<main>`, activating the link only moves the scroll position —
  keyboard focus stays on the link and the next Tab walks back through the
  banner/header. `tabIndex={-1}` makes the in-page jump actually move focus into
  the form. This was the fix for the "skip link doesn't change tab order"
  symptom observed in manual testing.
- **The `<details>` lives in `form-renderer`, not `field-renderer`.** The
  controlled sibling fields are looped in `form-renderer` (they're separate form
  fields with their own validators) and the toggle's open state is already read
  there reactively from `form.store`. Consolidating the whole disclosure in
  `form-renderer` lets the controlled fields nest natively inside
  `govbb-show-hide__content`, and matches the existing split — `field-renderer`
  renders one control, `form-renderer` owns group layout + reveal. The toggle's
  `onToggle` writes `<details>.open` back via `form.setFieldValue` (the toggle
  carries no validators, so no revalidation is needed); form state stays the
  single source of truth, avoiding a fight between native `<details>` toggling
  its own `open` and React.
- **The textarea fix is defensive — no live recipe uses a `fieldArray`
  textarea.** A sweep of `apps/api/.../recipes` found `components/generic-textarea`
  and `fieldArray` behaviours, but never combined. The bug was therefore
  unreachable in production; the regression test guards it rather than fixing a
  user-visible break.

## Open questions

- None blocking. The skip link and show/hide are manually verifiable in a
  running app (`/forms/get-birth-certificate` exercises show/hide on the "Tell us
  about yourself" step); the textarea-repeat path is only reachable by authoring
  such a field in the form builder, so it's covered by the regression test alone.
- Site chrome (Footer/Header/Official banner) accessibility is owned by
  `@govtech-bb/react` + `@govtech-bb/design` and was left out of scope per the
  issue — raise upstream if gaps remain.
