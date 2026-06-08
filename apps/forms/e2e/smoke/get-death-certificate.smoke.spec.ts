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
 *    checkbox input is `declaration_declaration-confirmed-confirmed`. The
 *    optional `declaration-date` date widget is filled with a past date.
 *  - The `submission-confirmation` step title is "Application submitted" and the
 *    recipe sets no processing message; on the payment flow the helper's default
 *    "saved" subheading does not render, so the subheading is omitted and the
 *    heading is matched against the step title.
 */
import { faker } from "@faker-js/faker";
import { test } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "get-death-certificate";

// PARKED (test.fixme) — and intentionally NOT wired into deploy-sandbox.yml.
//
// This spec drives the whole form correctly and the submission SUCCEEDS:
// `POST /submissions` returns 200 with `status: "success"`, a real
// `referenceCode` (e.g. GDC-…), `status: "pending_payment"` and a
// `meta.deferred.paymentUrl` to EZ Pay ($5/copy). But the deployed
// `submission-confirmation` screen then renders the generic error state
// ("Something went wrong — We could not process your submission. No
// information has been saved.") instead of redirecting to EZ Pay / showing the
// success heading — reproducibly (3/3 incl. retries). The sibling payment form
// get-marriage-certificate reaches "Application submitted" on the same path, so
// this is a death-certificate-specific deployed-app bug, not a spec defect.
// Tracked in #919; un-fixme this and re-add its smoke-test job once the
// payment-confirmation flow is fixed. (See the referral-student-support-services
// precedent in deploy-sandbox.yml.)
test.describe("Get a Death Certificate — Live Smoke", () => {
  test.fixme("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about yourself ──────────────────────────────────────────────
    let step = expectStep(page, "applicant-details", { exact: true });
    await selectDropdown(page, step, "applicant-title", "mr");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillField(
      page,
      step,
      "applicant-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    // Masked National ID (999999-9999) — supply the `850101-0001` shape; a bare
    // numeric string fails the mask's `^\d{6}-\d{4}$` pattern.
    await fillField(page, step, "applicant-id-number", "850101-0001");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    // passport-toggle left OFF → applicant-passport-number stays hidden.
    await advance(page, step);

    // ─── Your relationship with the deceased ("spouse" hides the conditional) ─
    // The relationship <select>'s fieldId is the component default `relationship`
    // (the recipe sets no fieldId override), NOT `relationship-to-person`.
    step = expectStep(page, "relationship-to-person", { exact: true });
    await selectDropdown(page, step, "relationship", "spouse");
    await advance(page, step);

    // ─── Why you need this certificate (reason, min 10 chars) ────────────────
    step = expectStep(page, "reason-for-certificate", { exact: true });
    // `reason-for-certificate` uses the `components/name` validator (letters,
    // spaces, hyphens and apostrophes only) — no periods, commas or digits.
    await fillField(
      page,
      step,
      "reason-for-certificate",
      "To settle the deceased estate and close outstanding accounts",
    );
    await advance(page, step);

    // ─── Tell us about the deceased (known date of death → date widget) ──────
    step = expectStep(page, "deceased-details", { exact: true });
    await fillField(
      page,
      step,
      "deceased-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "deceased-last-name", faker.person.lastName());
    await selectRadio(page, step, "deceased-known-date-of-death", "yes");
    await fillDate(page, step, "deceased-date-of-death", 3, 4, 2020);
    // `deceased-place-of-death` also uses the `components/name` validator — no
    // commas/periods.
    await fillField(
      page,
      step,
      "deceased-place-of-death",
      "Bridgetown Saint Michael",
    );
    await advance(page, step);

    // ─── How many copies do you need? ────────────────────────────────────────
    step = expectStep(page, "order-details", { exact: true });
    await fillField(page, step, "number-of-copies", "1");
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration) ───────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();
    await fillDate(page, step, "declaration-date", 6, 6, 2026);

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
    });
  });
});
