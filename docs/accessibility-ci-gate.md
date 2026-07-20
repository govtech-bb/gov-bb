# Accessibility (axe) CI gate

A CI check that loads the deployed **forms** app in a real browser and fails a PR
if it introduces a **serious/critical** WCAG 2.0/2.1 A-or-AA accessibility
violation. It guards against regressing the accessibility fixes already made, and
catches issues (colour contrast, focus, layout) that the jsdom-based `jest-axe`
unit tests structurally cannot.

Issue: [#1971](https://github.com/govtech-bb/gov-bb/issues/1971).

## How it runs

- **In CI:** the `a11y-forms-preview` job in
  [pr-preview.yml](../.github/workflows/pr-preview.yml) waits for the per-PR forms
  preview, then calls the reusable
  [forms-a11y.yml](../.github/workflows/forms-a11y.yml) with the preview URL. It
  runs on every previewed PR (it never submits a form, so — unlike the smoke test
  — it has no form-contract-skew dependency).
- **Locally / on demand:**

  ```bash
  # Default target is sandbox
  pnpm --filter @govtech-bb/forms test:a11y

  # Or point at any deployed environment
  A11Y_BASE_URL=https://forms.alpha.gov.bb pnpm --filter @govtech-bb/forms test:a11y
  ```

  (First run needs the browser: `pnpm --filter @govtech-bb/forms exec playwright install chromium`.)

## What it scans (first slice)

Defined in [forms.a11y.spec.ts](../apps/forms/e2e/a11y/forms.a11y.spec.ts):

- the **first step** of a public form (`jobstart-plus-programme`) — exercises the
  shared field-rendering, labels, headings, landmarks, focus and contrast, and
- the **not-found** page (the shared `ErrorPage` component).

The form must be **public** (the deployed frontend reads the sandbox/preview API,
which 404s non-public forms).

## What fails the build

Only violations with axe impact **`serious`** or **`critical`**, scoped to the
WCAG A/AA rule tags (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`). See
[e2e/helpers/a11y.ts](../apps/forms/e2e/helpers/a11y.ts). `minor`/`moderate`
findings and axe *best-practice* rules (e.g. `heading-order`) do **not** fail the
build yet — this keeps the gate green on landing and lets the threshold tighten
later.

## Reading a failure

The assertion message lists each blocking violation — rule id, impact, the axe
help URL, and the first offending DOM nodes — so the CI log is actionable on its
own. On failure the Playwright trace is uploaded as the `forms-preview-a11y-trace`
artifact for a full replay.

## Extending it

- **More pages / deeper form steps:** add scans to `forms.a11y.spec.ts` (walking a
  form's later steps needs field-filling, like the smoke helpers).
- **landing / chat:** both already get preview URLs in `pr-preview.yml`; mirror the
  `forms-a11y.yml` pattern with an app-specific spec (tracked as follow-ups to
  #1971).
