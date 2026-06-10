/**
 * sports-training-programme-form-schema.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Register for Community Sports Training
 * Programme" form (formId `sports-training-programme-form-schema`, version
 * 1.0.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The recipe has an email processor on `contact.contact-email`, so a green run
 * emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.0.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `personal.applicant-sex` is `components/sex` → radio (values male/female).
 *  - `personal.applicant-dob` is `components/date-of-birth` → three-part
 *    day/month/year widget; must be in the past.
 *  - `contact.contact-parish` / `emergency-parish` are `components/parish` →
 *    native `<select>` with slug values (use "st-michael").
 *  - `experience.years-of-experience` is `components/generic-number` → number
 *    input (fillField).
 *  - Conditionals / branches we choose to keep the optional sub-fields hidden:
 *      • `discipline.has-experience` = "no" → the whole `experience` step is
 *        `stepConditionalOn has-experience == "yes"`, so answering "no" skips it.
 *      • `experience.other-experience` (fieldConditionalOn level == "other") —
 *        not reached because the step is skipped.
 *      • `employment.employment-status` = "employed" keeps the
 *        `employment-other-details` (== "other") conditional hidden;
 *        `institution-name` is visible+optional but we fill it.
 *      • `membership.belongs-to-organisations` = "no" keeps `organisation-1..3`
 *        (== "yes") conditionals hidden.
 *  - The renderer auto-injects `check-your-answers` before the declaration; it is
 *    guarded below.
 *  - `declaration` is the explicit final step; its single-option confirmation
 *    checkbox input is `declaration_declaration-confirmed-confirmed`. The
 *    recipe's `declaration-date` is `isHidden`, so it is not filled.
 *  - The confirmation step title is "Application submitted" (rendered as the h1)
 *    and the recipe sets no processing message, so the subheading falls back to
 *    the generic "Your submission has been saved" (omitted below).
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

const FORM_ID = "sports-training-programme-form-schema";

test.describe("Community Sports Training Programme — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about yourself ──────────────────────────────────────────────
    let step = expectStep(page, "personal", { exact: true });
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-dob", 15, 6, 1995);
    await selectRadio(page, step, "applicant-sex", "male");
    await advance(page, step);

    // ─── Which sport are you interested in? ──────────────────────────────────
    // "No" to experience skips the conditional `experience` step entirely.
    step = expectStep(page, "discipline", { exact: true });
    await fillField(page, step, "discipline-interest", "Football");
    await selectRadio(page, step, "has-experience", "no");
    await advance(page, step);

    // ─── What is your employment status? ─────────────────────────────────────
    // "employed" keeps the `employment-other-details` (== "other") conditional
    // hidden; `institution-name` is visible + optional, so we fill it.
    step = expectStep(page, "employment", { exact: true });
    await selectRadio(page, step, "employment-status", "employed");
    // Deterministic, validator-safe value: faker.company.name() can emit
    // commas / periods / "&" that trip a letters-only name validator.
    await fillField(
      page,
      step,
      "institution-name",
      "Barbados Community College",
    );
    await advance(page, step);

    // ─── Do you belong to any organisations? ─────────────────────────────────
    // "No" keeps the `organisation-1..3` (== "yes") conditionals hidden.
    step = expectStep(page, "membership", { exact: true });
    await selectRadio(page, step, "belongs-to-organisations", "no");
    await advance(page, step);

    // ─── Your contact details ────────────────────────────────────────────────
    step = expectStep(page, "contact", { exact: true });
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

    // ─── Emergency contact ───────────────────────────────────────────────────
    step = expectStep(page, "emergency", { exact: true });
    await fillField(
      page,
      step,
      "emergency-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "emergency-last-name", faker.person.lastName());
    await fillField(page, step, "emergency-relationship", "Parent");
    await fillField(
      page,
      step,
      "emergency-address-1",
      faker.location.streetAddress(),
    );
    // Deployed form marks `emergency-address-2` required (recipe-vs-deployed
    // drift — the recipe treats line 2 as optional; the `contact` step does not
    // require its line 2, so the drift is per-step).
    await fillField(
      page,
      step,
      "emergency-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "emergency-parish", "st-michael");
    await fillField(page, step, "emergency-email", "testing@govtech.bb");
    await fillField(page, step, "emergency-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration, if present) ───
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    // Confirmation step title is the h1; recipe sets no processing message, so
    // the subheading falls back to "Your submission has been saved" (omitted).
    await submitAndConfirm(page, {
      heading: "Application submitted",
    });
  });
});
