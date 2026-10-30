/**
 * get-death-certificate.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Get a Death Certificate" form (formId
 * `get-death-certificate`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has a payment processor ($5/copy via EZ Pay) and an email processor
 * on `applicant-details.applicant-email`, so a green run emails
 * `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant-title` (components/title), `applicant-parish` and
 *    `relationship-to-person` (components/parish, components/relationship)
 *    render as native `<select>` — use `selectDropdown` with slug values
 *    ("mr", "st-michael", "spouse").
 *  - `passport-toggle` (components/show-hide) is left OFF, so we fill the
 *    applicant National ID number and the conditional
 *    `applicant-passport-number` field stays hidden.
 *  - `relationship-to-person` = "spouse" keeps the conditional
 *    `relationship-other-description` field hidden (it shows only on "other").
 *  - `deceased-known-date-of-death` = "yes" shows the `deceased-date-of-death`
 *    three-part date widget (set to a valid date in the past) and keeps the
 *    conditional `deceased-estimated-date-of-death` text field hidden. The
 *    deceased `deceased-id-number` is optional and left blank.
 *  - `number-of-copies` is a `generic-number` input (required).
 *  - `check-your-answers` is auto-injected by the renderer before declaration
 *    (guarded advance).
 *  - `declaration` is the explicit final step; its single-option confirmation
 *    checkbox input is `declaration_declaration-confirmed`.
 *  - The walk itself lives in ../helpers/get-death-certificate so Journey 5
 *    (the EZ Pay payment journey, #3012) can reuse it.
 *  - The `submission-confirmation` step title is "Application submitted". What
 *    sits under it depends on payment: with SMOKE_SUBMISSION_TOKEN (the deploy
 *    smoke) the API drops the payment, so it reads "Your submission has been
 *    saved"; without it the form is payment-gated and shows "Complete your
 *    payment" with the EZ Pay link. Either one means the submission persisted.
 */
import { test } from "@playwright/test";
import { fillDeathCertificate } from "../helpers/get-death-certificate";
import { submitAndConfirm } from "../helpers/smoke";

test.describe("Get a Death Certificate — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await fillDeathCertificate(page, { email: "testing@govtech.bb" });

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
      subheading: /Your submission has been saved|Complete your payment/,
    });
  });
});
