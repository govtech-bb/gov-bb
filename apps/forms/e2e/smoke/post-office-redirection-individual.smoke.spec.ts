/**
 * post-office-redirection-individual.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Redirect my personal mail" form (formId
 * `post-office-redirection-individual`, version 1.5.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has two email processors (the applicant's email + the MDA inbox), so
 * a green run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.5.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `applicant-title` renders as a native `<select>` (components/title) — use
 *    selectDropdown with a slug value ("mr").
 *  - `applicant-date-of-birth` is a three-part day/month/year widget and must be
 *    in the past.
 *  - `passport-toggle` (components/show-hide) is left OFF, so the conditional
 *    `applicant-passport-number` stays hidden and the National ID number is the
 *    required identifier (pattern `^[0-9]{6}-[0-9]{4}$`, e.g. 850101-0001).
 *  - `old-parish` / `new-parish` render as native `<select>` (slug values, e.g.
 *    "st-michael"); postcodes are optional and omitted.
 *  - `new-redirection-start-date` / `new-redirection-end-date`
 *    (components/generic-date → htmlType "date") are three-part widgets; the end
 *    date is kept within 6 months of the start.
 *  - `minor-dependents.dependents-any-minor-dependents` = "no" keeps the
 *    conditional `minor-details` repeatable step hidden; likewise
 *    `adult-dependents.adult-any-adults` = "no" keeps `adult-details` hidden.
 *  - `check-your-answers` is an explicit recipe step.
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`. The recipe's
 *    `declaration-date-of-declaration` is `isHidden`, so it is not filled.
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

const FORM_ID = "post-office-redirection-individual";

test.describe("Post Office Redirection (Individual) — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about yourself ──────────────────────────────────────────────
    let step = expectStep(page, "applicant-details", { exact: true });
    await expect(page.locator("h1")).toContainText("Tell us about yourself");
    await selectDropdown(page, step, "applicant-title", "mr");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(
      page,
      step,
      "applicant-middle-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-date-of-birth", 15, 6, 1990);
    // passport-toggle left OFF → passport field hidden, National ID required.
    await fillField(page, step, "applicant-id-number", "850101-0001");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone-number", "246-418-1234");
    await advance(page, step);

    // ─── Old address ─────────────────────────────────────────────────────────
    step = expectStep(page, "old-address", { exact: true });
    await fillField(
      page,
      step,
      "old-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "old-parish", "st-michael");
    // postcode is optional — omitted.
    await advance(page, step);

    // ─── New address (with redirection start/end dates) ──────────────────────
    step = expectStep(page, "new-address", { exact: true });
    await fillField(
      page,
      step,
      "new-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "new-parish", "christ-church");
    // postcode is optional — omitted.
    await fillDate(page, step, "new-redirection-start-date", 1, 8, 2026);
    await fillDate(page, step, "new-redirection-end-date", 1, 11, 2026);
    await advance(page, step);

    // ─── Minor dependents? ("No" keeps the minor-details step hidden) ────────
    step = expectStep(page, "minor-dependents", { exact: true });
    await selectRadio(page, step, "dependents-any-minor-dependents", "no");
    await advance(page, step);

    // ─── Adult dependents? ("No" keeps the adult-details step hidden) ────────
    step = expectStep(page, "adult-dependents", { exact: true });
    await selectRadio(page, step, "adult-any-adults", "no");
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
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
      heading: "Thank you for your request",
      subheading:
        "Your information has been sent to the Barbados Postal Service.",
    });
  });
});
