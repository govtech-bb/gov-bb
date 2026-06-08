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
import { test, expect } from "@playwright/test";
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

test.describe("Get a Death Certificate — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
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
    await fillField(page, step, "applicant-id-number", faker.string.numeric(9));
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    // passport-toggle left OFF → applicant-passport-number stays hidden.
    await advance(page, step);

    // ─── Your relationship with the deceased ("spouse" hides the conditional) ─
    step = expectStep(page, "relationship-to-person", { exact: true });
    await selectDropdown(page, step, "relationship-to-person", "spouse");
    await advance(page, step);

    // ─── Why you need this certificate (reason, min 10 chars) ────────────────
    step = expectStep(page, "reason-for-certificate", { exact: true });
    await fillField(
      page,
      step,
      "reason-for-certificate",
      "Required to settle the estate and close outstanding accounts.",
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
    await fillField(
      page,
      step,
      "deceased-place-of-death",
      "Bridgetown, Barbados",
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
