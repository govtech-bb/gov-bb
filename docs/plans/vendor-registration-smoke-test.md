# Plan: Live sandbox smoke test for Smart Stream Vendor Registration

> **Status: implemented.** This doc has been updated to reflect what was
> actually built (the original draft guessed some step IDs that turned out to be
> wrong — corrected below from a live walkthrough of the form).

## Goal

A Playwright end-to-end smoke test that drives the **real** Smart Stream Vendor
Registration form on the deployed sandbox
(`https://forms.sandbox.alpha.gov.bb/forms/smart-stream-vendor-registration`),
fills every step with valid data, **submits for real**, and asserts the
confirmation screen ("Your submission has been saved" + a reference number).

Run **on demand** (`pnpm --filter @govtech-bb/forms test:smoke`). It is
deliberately kept out of the normal `nx test` / CI build-test suite.

## Why

The existing `apps/forms/e2e/` suite only exercises the synthetic `master` form
against a local dev server with mocked submissions. Nothing verifies that a real,
DB-backed form renders and submits successfully in a deployed environment. This
smoke test gives a fast manual check that the sandbox vendor-registration path is
healthy end to end (frontend → API → submission → confirmation).

## Approach (as built)

A **separate Playwright config and test directory**, rather than extending the
existing suite. The existing `apps/forms/playwright.config.ts` boots a local Vite
dev server with `baseURL: http://localhost:3000` and `testDir: ./e2e`, which
would otherwise sweep up the new spec and run it against localhost (or in CI).

- **New config** `playwright.smoke.config.ts`: `baseURL` →
  `https://forms.sandbox.alpha.gov.bb` (override with `SMOKE_BASE_URL`), **no
  `webServer`** block, `testDir` → `./e2e/smoke`, `retries: 0`, single chromium
  project.
- **New spec** `e2e/smoke/vendor-registration.smoke.spec.ts`.
- **Main config scoped**: `playwright.config.ts` now sets
  `testIgnore: "**/smoke/**"` so the local/CI suite never runs the smoke spec.
- **Data via `@faker-js/faker`** (added as a dev dependency). The `vendor-name`
  is prefixed `Smoke Test … <ISO timestamp>` so the real submission is traceable
  in the target environment. The confirmation email goes to a reserved
  `example.com` address so it never reaches a real inbox.

> **Deviation from the original draft:** the draft suggested reusing the existing
> `FormPage` POM (`e2e/helpers/form-page.ts`). The spec is instead self-contained
> because this form's radio fields (`vendor-classification`, `account-type`)
> render **per-option `id`s** (e.g. `bank-details_account-type-deposit`), whereas
> `FormPage.clickRadio` assumes a single shared radio `id`. Selecting radios by
> visible label via `getByRole("radio", { name })` is simpler and verified to
> work against the live renderer.

**Alternatives considered:**
- *Env-var switch inside the existing config* — rejected: muddies the local
  suite, risks accidentally running a real submission in CI.
- *Mock the submission / local fixture (deterministic CI regression)* — this is
  the other reasonable design, but it's explicitly **not** what we want here; the
  point is to verify the live deployed path.

## Form shape (verified live, version 1.1.0)

Six input steps, plus an auto-injected Check-Your-Answers review and a final
confirmation screen. **The real `stepId`s have no `step-N-` prefix** (the draft
guessed wrong):

| # | `stepId` | Fields filled |
|---|----------|----------------|
| 1 | `basic-info` | `min-dept` (text), `vendor-name` (text) |
| 2 | `classification` | `vendor-classification` (radio → e.g. "Small Business") |
| 3 | `identification` | `tamis-number` (text); `nrn` (masked `999999-9999`, pattern `^\d{6}-\d{4}$`). `company-reg-number` / `sba-number` optional. |
| 4 | `contact-address` | `vendor-address-line-1` (text), `vendor-address-line-2` (optional), `vendor-email` (email) |
| 5 | `bank-details` | `bank-name`, `bank-account-number`, `branch-name`, `name-on-account`, `account-type` (radio → "Deposit"/"Savings"), `bank-address`. `bic-swift` optional. |
| — | `check-your-answers` | Auto-injected review step — just Continue. |
| 6 | `declaration` | `declaration-confirmed` (checkbox). `declaration-date` is `isHidden: true` — auto-populated, not interacted with. Submit button lives here. |
| — | `submission-confirmation` | Final screen after a successful POST. |

DOM field IDs follow `${stepId}_${fieldId}` (e.g. `basic-info_vendor-name`).
No payment step, no file uploads, no conditionals, no auth.

## Scope

- [x] Add `e2e/smoke/vendor-registration.smoke.spec.ts` — single happy-path test:
      navigate to step 1, fill + Continue through every step, submit, assert the
      confirmation screen ("Application Submitted" / "Your submission has been
      saved" and a visible Reference Number).
- [x] Use **timestamped/unique data** for `vendor-name` so submissions are
      traceable.
- [x] Add `playwright.smoke.config.ts` (sandbox baseURL, no webServer,
      `testDir: ./e2e/smoke`, `SMOKE_BASE_URL` override).
- [x] Add a `test:smoke` script to `apps/forms/package.json`.
- [x] Scope `playwright.config.ts` (`testIgnore: "**/smoke/**"`) so the normal
      suite does not pick up the smoke spec — confirmed via `playwright test
      --list`.

## Files

- **Add** `apps/forms/playwright.smoke.config.ts`
- **Add** `apps/forms/e2e/smoke/vendor-registration.smoke.spec.ts`
- **Modify** `apps/forms/package.json` (add `test:smoke` script; add
  `@faker-js/faker` dev dependency)
- **Modify** `apps/forms/playwright.config.ts` (`testIgnore: "**/smoke/**"`)

## Verify

- `pnpm --filter @govtech-bb/forms test:smoke` passes against sandbox and the run
  produces a real submission landing on the confirmation screen.
- Normal suite is unaffected: `pnpm exec playwright test --list` shows the smoke
  spec is **not** included.
- Spot-check that a vendor record was created in sandbox with the timestamped
  `vendor-name` (manual, optional).

## Open questions (resolved)

- **Masked `nrn` input** — `fill()` does **not** cooperate with Maskito; the
  value must be typed character-by-character. The spec uses `pressSequentially`
  with the 10 raw digits and asserts the result matches `^\d{6}-\d{4}$`.
- **Hidden `declaration-date`** — confirmed auto-populated; it does not block
  submission and is not interacted with.
- **Success-screen selectors** — confirmed: `<h1>` "Application Submitted", body
  text "Your submission has been saved", a "Reference Number" row, and the UUID
  returned as `response.data.id` (component:
  `src/components/submission-confirmation.tsx`, no-payment branch).
