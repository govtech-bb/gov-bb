/**
 * apply-for-conductor-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Apply for a Conductor Licence" form
 * (formId `apply-for-conductor-licence`, version 1.4.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The recipe has an email processor on `contact-details.contact-email`, so a
 * green run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.4.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `applicant-title` and `contact-parish` render as native `<select>` — use
 *    selectDropdown with slug values ("mr", "st-michael").
 *  - `applicant-nid` (National ID Number) carries a Maskito hard mask
 *    (`999999-9999`), so fill() is bypassed: type the raw digits with
 *    pressSequentially and assert the NNNNNN-NNNN shape (cf. vendor NRN).
 *  - `passport-toggle` is a show/hide <button> (collapsed by default). Leaving
 *    it closed keeps the conditional `applicant-passport-number` hidden and the
 *    National ID field required — so we fill the National ID and never touch
 *    the toggle.
 *  - `applicant-dob` and `licence-date-of-issue` etc. are three-part
 *    day/month/year date widgets (fillDate); DOB must be in the past.
 *  - `has-previous-licence` = "no" keeps the conditional `licence-number` /
 *    `licence-date-of-issue` fields hidden.
 *  - `has-endorsements` = "no" makes the whole `endorsement-details` step
 *    (stepConditionalOn = "yes") drop out — it is never reached.
 *  - `has-disqualifications` = "no" keeps the conditional disqualification
 *    fields hidden; `has-convictions` = "no" is a plain radio with no children.
 *  - `police-certificate` is a required single-file upload (uploadOne).
 *  - `check-your-answers` is auto-injected before the declaration (guarded).
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`. `declaration-date` is
 *    isHidden and auto-populated — not interacted with.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import { TEST_PNG } from "../helpers/test-data";
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
  uploadOne,
} from "../helpers/smoke";

const FORM_ID = "apply-for-conductor-licence";

test.describe("Apply for a Conductor Licence — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about yourself ──────────────────────────────────────────────
    let step = expectStep(page, "applicant", { exact: true });
    await expect(page.locator("h1")).toContainText("Tell us about yourself");
    await selectDropdown(page, step, "applicant-title", "mr");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-dob", 30, 12, 1986);
    // Masked National ID (999999-9999): type raw digits so Maskito formats it.
    const nid = page.locator(`input[id="${step}_applicant-nid"]`);
    await nid.pressSequentially(faker.string.numeric(10));
    await expect(nid).toHaveValue(/^\d{6}-\d{4}$/);
    // Leave the passport-toggle closed so `applicant-passport-number` stays hidden.
    await advance(page, step);

    // ─── Contact details ─────────────────────────────────────────────────────
    step = expectStep(page, "contact-details", { exact: true });
    await fillField(
      page,
      step,
      "contact-address-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "contact-parish", "st-michael");
    await fillField(page, step, "contact-email", "testing@govtech.bb");
    await fillField(page, step, "contact-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Licence history ("No" keeps the conditional fields hidden) ──────────
    step = expectStep(page, "licence-history", { exact: true });
    await selectRadio(page, step, "has-previous-licence", "no");
    await advance(page, step);

    // ─── Endorsements ("No" makes endorsement-details drop out entirely) ─────
    step = expectStep(page, "endorsements", { exact: true });
    await selectRadio(page, step, "has-endorsements", "no");
    await advance(page, step);

    // ─── Disqualifications ("No" keeps the conditional fields hidden) ────────
    step = expectStep(page, "disqualifications", { exact: true });
    await selectRadio(page, step, "has-disqualifications", "no");
    await advance(page, step);

    // ─── Criminal convictions ────────────────────────────────────────────────
    step = expectStep(page, "convictions", { exact: true });
    await selectRadio(page, step, "has-convictions", "no");
    await advance(page, step);

    // ─── Upload supporting documents ─────────────────────────────────────────
    step = expectStep(page, "document-uploads", { exact: true });
    await uploadOne(page, step, "police-certificate", TEST_PNG);
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

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: /submitted/i,
    });
  });
});
