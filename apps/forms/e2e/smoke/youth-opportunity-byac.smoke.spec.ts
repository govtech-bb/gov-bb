/**
 * youth-opportunity-byac.smoke.spec.ts
 *
 * Live, on-demand smoke test for "Apply to the Barbados YouthADVANCE Corps (BYAC)"
 * (formId `youth-opportunity-byac`).
 *
 * Drives the real form, fills every required field, SUBMITS FOR REAL and
 * asserts the confirmation screen. The email processor sends to
 * `your-address-and-contact-details.applicant-email`, so a green run emails
 * `testing@govtech.bb` unless SMOKE_SUBMISSION_TOKEN is set (ADR 0087).
 *
 * Runs only via playwright.smoke.config.ts. Shared helpers live in
 * ../helpers/smoke. The recipe is `preview`, so set PREVIEW_TOKEN.
 *
 * Route walked by the happy path:
 *  - national-id-check: "yes" reveals `national-id-number` and passes the
 *    `^yes$` eligibility stop.
 *  - applicant-details: a 17-year-old Barbadian citizen, so the citizenship,
 *    residency and permission-to-study questions stay hidden.
 *  - Under 18, so `parent-or-guardian` shows. At 16 or over the parent email
 *    is optional (`optionalIf`), so it is left blank. `parent-same-address`
 *    "yes" keeps the parent address fields hidden. Ticking
 *    `parent-is-emergency-contact` skips `emergency-contact`.
 *  - your-education: primary school "Other" reveals its name field; still at
 *    secondary school, so `secondary-school-end-year` stays hidden.
 *  - has-qualifications "yes" shows the repeatable `qualifications` step. The
 *    base step is the first row (plain field ids), then "Add another?" no.
 *  - The parent step needs the forms-app fix in #3917: the step-visibility
 *    memo keys watched values with String(), so a date answer reads
 *    "[object Object]" and steps never re-evaluate once the date is complete.
 *    Until #3917 lands, this walk and the parent-address test below land on
 *    `emergency-contact`.
 *  - Every health, diet and disability question is "no", so no detail fields.
 *  - documents and referee-testimonials: every upload is optional, so both
 *    are skipped.
 *  - The BYAC landing page has no online start page, so there is no
 *    `landingStartPath`: this spec does not run in a SMOKE_LANDING_URL run.
 *
 * A second test checks the no-ID stop inline. A third takes the
 * `parent-same-address` "no" route: the parent's address line 1 is an address
 * lookup that only mounts once "no" is chosen, and picking a suggestion fills
 * `parent-address-line-2` and `parent-parish`. It stops once the page moves
 * past `parent-or-guardian`, without submitting.
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
  mockGeocoder,
  openSmokeForm,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  tickCheckbox,
} from "../helpers/smoke";

const FORM_ID = "youth-opportunity-byac";

test.describe("Barbados YouthADVANCE Corps (BYAC) — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    // Address line 1 is an address lookup; keep its suggestions off the network.
    await mockGeocoder(page);
    await openSmokeForm(page, FORM_ID);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Do you have a Barbados national ID number? ──────────────────────────
    let step = expectStep(page, "national-id-check", { exact: true });
    await selectRadio(page, step, "has-national-id", "yes");
    await fillField(page, step, "national-id-number", "850101-0001");
    await advance(page, step);

    // ─── Your details ────────────────────────────────────────────────────────
    step = expectStep(page, "applicant-details", { exact: true });
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    // 17 on any day of the year: under 18 (parent steps show), 16 or over
    // (parent email optional).
    const today = new Date();
    await fillDate(page, step, "applicant-dob", 1, 1, today.getFullYear() - 17);
    await selectRadio(page, step, "sex", "female");
    await selectRadio(page, step, "barbados-citizen", "yes");
    await advance(page, step);

    // ─── Your contact details ────────────────────────────────────────────────
    step = expectStep(page, "your-address-and-contact-details", {
      exact: true,
    });
    await fillField(
      page,
      step,
      "address-line-1",
      faker.location.streetAddress(),
    );
    await page.keyboard.press("Escape");
    await selectDropdown(page, step, "parish", "st-michael");
    await fillField(page, step, "telephone", "246-418-1234");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await advance(page, step);

    // ─── Your parent or guardian ─────────────────────────────────────────────
    step = expectStep(page, "parent-or-guardian", { exact: true });
    await fillField(page, step, "parent-first-name", faker.person.firstName());
    await fillField(page, step, "parent-last-name", faker.person.lastName());
    await selectDropdown(page, step, "parent-relationship", "mother");
    await fillField(page, step, "parent-telephone", "246-418-5678");
    await selectRadio(page, step, "parent-same-address", "yes");
    await tickCheckbox(page, step, "parent-is-emergency-contact", "yes");
    await advance(page, step);

    // ─── Your education (emergency-contact is skipped by the checkbox) ───────
    step = expectStep(page, "your-education", { exact: true });
    await selectDropdown(page, step, "primary-school", "other");
    await fillField(page, step, "other-primary-school", "Kingston Primary");
    await fillField(
      page,
      step,
      "primary-school-start-year",
      String(today.getFullYear() - 12),
    );
    await fillField(
      page,
      step,
      "primary-school-end-year",
      String(today.getFullYear() - 6),
    );
    await selectDropdown(page, step, "secondary-school", "alexandra-school");
    await fillField(
      page,
      step,
      "secondary-school-start-year",
      String(today.getFullYear() - 6),
    );
    await selectRadio(page, step, "still-at-secondary-school", "yes");
    await advance(page, step);

    // ─── Your qualifications ─────────────────────────────────────────────────
    step = expectStep(page, "has-qualifications-check", { exact: true });
    await selectRadio(page, step, "has-qualifications", "yes");
    await advance(page, step);

    // ─── Tell us about your qualification (repeatable, one row) ──────────────
    step = expectStep(page, "qualifications", { exact: true });
    await fillField(page, step, "subject", "Mathematics");
    await selectDropdown(page, step, "examining-body", "cxc");
    await fillField(page, step, "grade", "II");
    await fillField(page, step, "year", String(today.getFullYear() - 1));
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Your interests and plans ────────────────────────────────────────────
    step = expectStep(page, "your-interests-and-plans", { exact: true });
    await selectDropdown(page, step, "employment-status", "no");
    await selectRadio(page, step, "club-member", "no");
    await fillField(
      page,
      step,
      "interests",
      "Football, cooking and fixing bikes.",
    );
    await selectRadio(page, step, "swimming-ability", "yes");
    await advance(page, step);

    // ─── Why you want to join BYAC ───────────────────────────────────────────
    step = expectStep(page, "why-join-byac", { exact: true });
    await fillField(
      page,
      step,
      "why-join",
      "I want to learn new skills, get fitter and find out about jobs I could do.",
    );
    await advance(page, step);

    // ─── Your uniform sizes ──────────────────────────────────────────────────
    step = expectStep(page, "uniform-sizes", { exact: true });
    await fillField(page, step, "shirt-size", "M");
    await fillField(page, step, "pants-size", "32");
    await fillField(page, step, "shoe-size", "9");
    await advance(page, step);

    // ─── Your health ─────────────────────────────────────────────────────────
    step = expectStep(page, "health-conditions", { exact: true });
    for (const condition of ["rheumatic-fever", "asthma", "allergies"]) {
      await selectRadio(page, step, condition, "no");
    }
    await advance(page, step);

    // ─── More about your health ──────────────────────────────────────────────
    step = expectStep(page, "more-health-conditions", { exact: true });
    for (const condition of ["epilepsy", "diabetes", "other-disorders"]) {
      await selectRadio(page, step, condition, "no");
    }
    await advance(page, step);

    // ─── Medicines, blood type and diet ──────────────────────────────────────
    step = expectStep(page, "other-health-information", { exact: true });
    await selectRadio(page, step, "medication-allergies", "no");
    await selectDropdown(page, step, "blood-type", "dont-know");
    await selectRadio(page, step, "special-diet", "no");
    await advance(page, step);

    // ─── Religion and disability ─────────────────────────────────────────────
    step = expectStep(page, "religion-and-disability", { exact: true });
    await fillField(page, step, "religion", "None");
    await selectRadio(page, step, "has-disability", "no");
    await advance(page, step);

    // ─── Upload your documents / Referee testimonials (all optional) ─────────
    step = expectStep(page, "documents", { exact: true });
    await advance(page, step);
    step = expectStep(page, "referee-testimonials", { exact: true });
    await advance(page, step);

    // ─── How did you hear about us? ──────────────────────────────────────────
    step = expectStep(page, "how-did-you-hear-about-us", { exact: true });
    await selectDropdown(page, step, "referral-source", "social-media");
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`fieldset[id="declaration_declaration-confirmed"]`)
      .getByRole("checkbox")
      .check();

    // ─── Submit + Application submitted ─────────────────────────────────────
    await submitAndConfirm(page, { heading: "Application submitted" });
  });

  // An applicant without a national ID number is stopped on the question
  // itself: "No" reveals the warning and fails the `^yes$` pattern.
  test("stops an applicant without a national ID number inline", async ({
    page,
  }) => {
    await openSmokeForm(page, FORM_ID);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    const step = expectStep(page, "national-id-check", { exact: true });
    await selectRadio(page, step, "has-national-id", "no");
    await expect(page.locator(".govbb-warning-text")).toContainText(
      "You can still apply in person",
    );

    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.locator(".govbb-error-summary")).toContainText(
      "You need a Barbados National Identification (ID) number to apply online",
      { timeout: STEP_TIMEOUT },
    );
    expectStep(page, step, { exact: true });
  });

  // "No" to the same address shows the parent's own address. Its line 1 is an
  // address lookup that mounts only after that answer; picking a suggestion
  // fills the parent's line 2 and parish, not the applicant's.
  test("takes a parent address through the lookup when it differs", async ({
    page,
  }) => {
    await mockGeocoder(page);
    await openSmokeForm(page, FORM_ID);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    let step = expectStep(page, "national-id-check", { exact: true });
    await selectRadio(page, step, "has-national-id", "yes");
    await fillField(page, step, "national-id-number", "850101-0001");
    await advance(page, step);

    step = expectStep(page, "applicant-details", { exact: true });
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    const today = new Date();
    await fillDate(page, step, "applicant-dob", 1, 1, today.getFullYear() - 17);
    await selectRadio(page, step, "sex", "female");
    await selectRadio(page, step, "barbados-citizen", "yes");
    await advance(page, step);

    step = expectStep(page, "your-address-and-contact-details", {
      exact: true,
    });
    await fillField(
      page,
      step,
      "address-line-1",
      faker.location.streetAddress(),
    );
    await page.keyboard.press("Escape");
    await selectDropdown(page, step, "parish", "st-michael");
    await fillField(page, step, "telephone", "246-418-1234");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await advance(page, step);

    step = expectStep(page, "parent-or-guardian", { exact: true });
    await fillField(page, step, "parent-first-name", faker.person.firstName());
    await fillField(page, step, "parent-last-name", faker.person.lastName());
    await selectDropdown(page, step, "parent-relationship", "mother");
    await fillField(page, step, "parent-telephone", "246-418-5678");
    await selectRadio(page, step, "parent-same-address", "no");

    // A mocked place, so the lookup suggests it.
    await fillField(page, step, "parent-address", "Jemmotts Lane");
    await page
      .getByRole("option", { name: /Jemmotts Lane/ })
      .first()
      .click();
    await page.keyboard.press("Escape");
    await expect(page.locator(`[id="${step}_parent-address"]`)).toHaveValue(
      "Jemmotts Lane",
    );
    await expect(
      page.locator(`[id="${step}_parent-address-line-2"]`),
    ).toHaveValue("Bridgetown");
    await expect(
      page.locator(`select[id="${step}_parent-parish"]`),
    ).toHaveValue("st-michael");
    await selectDropdown(page, step, "parent-parish", "st-michael");
    await tickCheckbox(page, step, "parent-is-emergency-contact", "yes");
    await advance(page, step);

    // The emergency-contact step is skipped by the checkbox.
    expectStep(page, "your-education", { exact: true });
  });
});
