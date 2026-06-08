/**
 * jobstart-plus-programme.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Apply to Job start Plus Programme" form
 * (formId `jobstart-plus-programme`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `contact-details.contact-email`, so a green
 * run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant-title`, `emergency-title`, `marital-status`, `contact-parish`,
 *    `emergency-parish` render as native `<select>` — use `selectDropdown` with
 *    slug values.
 *  - `applicant-dob` is a `date-of-birth` (three-part day/month/year widget) and
 *    must be in the past.
 *  - applicant-details conditionals: `passport-toggle` is a show/hide checkbox —
 *    leaving it unchecked keeps the conditional `applicant-passport-number`
 *    hidden and keeps `applicant-nid` required (so the spec fills the ID number).
 *    `has-nis-number` = "yes" reveals the required `nis-number` field, so fill it.
 *  - disability-support: `has-disability` = "no" keeps the conditional
 *    `disability-details` hidden.
 *  - `post-secondary` is a repeatable step (min 1) — fill one row, "Add another?"
 *    → No. Its fields are all optional but we provide one for realism.
 *  - previous-paid-job: `has-previous-paid-job` = "yes" reveals the employer/
 *    occupation/dates/tasks conditional fields and the `another-previous-job`
 *    radio; answering that "no" keeps the conditional `another-previous-paid-job`
 *    repeatable step hidden entirely.
 *  - eligibility-age: `are-you-over-18` = "yes" reveals the required
 *    `willing-to-work-nights` radio.
 *  - The renderer auto-injects nothing extra: `check-your-answers` is an explicit
 *    recipe step. It is guarded all the same in case of deployment drift.
 *  - `declaration` carries a single-option confirmation checkbox; its input id is
 *    `declaration_declaration-confirmed-confirmed`. (`declaration-date` is hidden.)
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

const FORM_ID = "jobstart-plus-programme";

test.describe("JobStart Plus Programme — Live Smoke", () => {
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
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-dob", 15, 6, 1990);
    await selectRadio(page, step, "applicant-sex", "male");
    await selectDropdown(page, step, "marital-status", "single");
    // Leave `passport-toggle` unchecked → `applicant-nid` stays required and the
    // conditional `applicant-passport-number` stays hidden.
    // National ID pattern is `^\d{6}-\d{4}$` (e.g. 850101-0001).
    await fillField(page, step, "applicant-nid", "850101-0001");
    // "Yes" reveals the required `nis-number` field (pattern `^\d{6}$`).
    await selectRadio(page, step, "has-nis-number", "yes");
    await fillField(page, step, "nis-number", faker.string.numeric(6));
    await advance(page, step);

    // ─── Do you have a disability? ("No" keeps the conditional hidden) ───────
    step = expectStep(page, "disability-support", { exact: true });
    await selectRadio(page, step, "has-disability", "no");
    await advance(page, step);

    // ─── Your contact details ────────────────────────────────────────────────
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

    // ─── Emergency contact details ───────────────────────────────────────────
    step = expectStep(page, "emergency-contact", { exact: true });
    await selectDropdown(page, step, "emergency-title", "mrs");
    await fillField(
      page,
      step,
      "emergency-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "emergency-last-name", faker.person.lastName());
    await selectDropdown(page, step, "emergency-relationship", "parent");
    await fillField(
      page,
      step,
      "emergency-address-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "emergency-parish", "st-michael");
    await fillField(page, step, "emergency-email", "testing@govtech.bb");
    await fillField(page, step, "emergency-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Tell us about your primary education ────────────────────────────────
    step = expectStep(page, "primary-education", { exact: true });
    await fillField(page, step, "primary-school-name", "Bridgetown Primary");
    await fillField(page, step, "primary-start-year", "1996");
    await fillField(page, step, "primary-end-year", "2002");
    await advance(page, step);

    // ─── Tell us about your secondary education ──────────────────────────────
    step = expectStep(page, "secondary-education", { exact: true });
    await fillField(
      page,
      step,
      "secondary-school-name",
      "Harrison College School",
    );
    await fillField(page, step, "secondary-start-year", "2002");
    await fillField(page, step, "secondary-end-year", "2007");
    await advance(page, step);

    // ─── Post-secondary and tertiary training (repeatable, all optional) ─────
    step = expectStep(page, "post-secondary", { exact: true });
    await fillField(
      page,
      step,
      "post-sec-institution-1",
      "Barbados Community College",
    );
    await fillField(
      page,
      step,
      "post-sec-qualifications-1",
      "Associate Degree",
    );
    // `name` component pattern allows letters/space/'/- only (no commas/digits).
    await fillField(page, step, "post-sec-courses-1", "Business Studies");
    await fillField(page, step, "post-sec-start-year-1", "2007");
    await fillField(page, step, "post-sec-end-year-1", "2009");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Have you had a paid job? ("Yes" reveals the job-detail fields) ──────
    step = expectStep(page, "previous-paid-job", { exact: true });
    await selectRadio(page, step, "has-previous-paid-job", "yes");
    // employer-name/occupation/job dates use the `name` component, whose pattern
    // allows letters/space/'/- only (no digits or commas) — keep values text-only.
    await fillField(page, step, "employer-name", "Acme Trading Limited");
    await fillField(page, step, "occupation", "Sales Assistant");
    await fillField(page, step, "job-start-date", "January last year");
    await fillField(page, step, "job-end-date", "December last year");
    await fillField(
      page,
      step,
      "main-tasks",
      "Served customers and managed stock.",
    );
    // "No" keeps the conditional `another-previous-paid-job` repeatable step hidden.
    await selectRadio(page, step, "another-previous-job", "no");
    await advance(page, step);

    // ─── Tell us about your areas of interest ────────────────────────────────
    step = expectStep(page, "eligibility-interests", { exact: true });
    await fillField(
      page,
      step,
      "job-interests",
      "Carpentry and general construction work",
    );
    await advance(page, step);

    // ─── Are you 18 or over? ("Yes" reveals the night-shift radio) ───────────
    step = expectStep(page, "eligibility-age", { exact: true });
    await selectRadio(page, step, "are-you-over-18", "yes");
    await selectRadio(page, step, "willing-to-work-nights", "yes");
    await advance(page, step);

    // ─── Tell us about your short-term goals ─────────────────────────────────
    step = expectStep(page, "short-term-goals", { exact: true });
    await fillField(
      page,
      step,
      "short-term-goals",
      "I want to secure a full-time role and build practical trade skills.",
    );
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
      heading: "Application submitted",
    });
  });
});
