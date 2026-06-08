/**
 * project-protege-mentor.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Apply to be a Project Protege Mentor"
 * form (formId `project-protege-mentor`, version 1.0.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `contact.contact-email`, so a green run
 * emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.0.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant.applicant-dob` is a `date-of-birth` (three-part day/month/year
 *    widget) and must be in the past.
 *  - `contact-parish` renders as a native `<select>` — use `selectDropdown`
 *    with a slug value ("st-michael").
 *  - There are NO repeatable steps and NO file uploads in this form.
 *  - Conditionals are kept hidden by choosing non-triggering answers:
 *      · `employment-status` = "unemployed" hides the `institution-name`,
 *        `employer-name` and `other-employment-details` conditionals.
 *      · `share-phone-number` = "no" hides the `mentee-phone-number` conditional.
 *      · `has-mentee-in-mind` = "no" hides the `mentee-in-mind-name` conditional.
 *      · `has-mentor-experience` = "no" hides the `years-of-experience`
 *        conditional.
 *  - `declaration.declaration-date` is `isHidden: true` in the recipe, so it is
 *    not filled.
 *  - `declaration` is the explicit final step; its single-option confirmation
 *    checkbox input is `declaration_declaration-confirmed-confirmed`. The
 *    renderer auto-injects `check-your-answers` immediately before it.
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

const FORM_ID = "project-protege-mentor";

test.describe("Project Protege Mentor — Live Smoke", () => {
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
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-dob", 27, 3, 1990);
    // "unemployed" keeps the institution/employer/other-details conditionals hidden.
    await selectRadio(page, step, "employment-status", "unemployed");
    await advance(page, step);

    // ─── Contact details ─────────────────────────────────────────────────────
    step = expectStep(page, "contact", { exact: true });
    await fillField(
      page,
      step,
      "contact-address-1",
      faker.location.streetAddress(),
    );
    // Deployed form marks `contact-address-2` required (recipe-vs-deployed
    // drift — the recipe treats line 2 as optional).
    await fillField(
      page,
      step,
      "contact-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "contact-parish", "st-michael");
    await fillField(page, step, "contact-email", "testing@govtech.bb");
    await fillField(page, step, "contact-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Tell us why you would be a good mentor ──────────────────────────────
    step = expectStep(page, "mentorship", { exact: true });
    await fillField(
      page,
      step,
      "why-mentor",
      "I want to give back and help young people reach their potential.",
    );
    await fillField(
      page,
      step,
      "strengths",
      "I am patient, a good listener, and I communicate clearly.",
    );
    await fillField(
      page,
      step,
      "mentee-learn",
      "How to overcome setbacks and stay focused on long-term goals.",
    );
    await advance(page, step);

    // ─── Your preferences ────────────────────────────────────────────────────
    step = expectStep(page, "preferences", { exact: true });
    await selectRadio(page, step, "mentee-gender-preference", "no-preference");
    // "no" keeps the `mentee-phone-number` conditional hidden.
    await selectRadio(page, step, "share-phone-number", "no");
    // "no" keeps the `mentee-in-mind-name` conditional hidden.
    await selectRadio(page, step, "has-mentee-in-mind", "no");
    await advance(page, step);

    // ─── Your experience ─────────────────────────────────────────────────────
    step = expectStep(page, "experience", { exact: true });
    // "no" keeps the `years-of-experience` conditional hidden.
    await selectRadio(page, step, "has-mentor-experience", "no");
    await advance(page, step);

    // ─── Tell us about your professional referee ─────────────────────────────
    step = expectStep(page, "professional-referee", { exact: true });
    await fillField(
      page,
      step,
      "prof-ref-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "prof-ref-last-name", faker.person.lastName());
    await fillField(page, step, "prof-ref-relationship", "Former supervisor");
    await fillField(page, step, "prof-ref-email", "testing@govtech.bb");
    await fillField(page, step, "prof-ref-phone", "246-418-1234");
    await advance(page, step);

    // ─── Tell us about your personal referee ─────────────────────────────────
    step = expectStep(page, "personal-referee", { exact: true });
    await fillField(
      page,
      step,
      "pers-ref-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "pers-ref-last-name", faker.person.lastName());
    await fillField(page, step, "pers-ref-relationship", "Community leader");
    await fillField(page, step, "pers-ref-email", "testing@govtech.bb");
    await fillField(page, step, "pers-ref-phone", "246-418-1234");
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
    await submitAndConfirm(page, {
      heading: /submitted/i,
    });
  });
});
