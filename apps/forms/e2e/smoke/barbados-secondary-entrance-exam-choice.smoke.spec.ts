/**
 * barbados-secondary-entrance-exam-choice.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Barbados Secondary School Entrance
 * Examination - Choice of School Form" (formId
 * `barbados-secondary-entrance-exam-choice`, version 1.1.0).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid data, SUBMITS FOR REAL, and asserts the
 * submission-confirmation screen is reached. The form has no file uploads, so
 * the run needs no AWS credentials and no presign → S3 → confirm flow; the only
 * external effect of a green run is a real submission (the form has an email
 * processor on `applicant-info.email`, so the confirmation email goes to
 * `testing@govtech.bb`).
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts, so it is NEVER swept into the CI `test:e2e` run.
 * Shared step/field helpers live in ../helpers/smoke.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Recipe 1.1.0 uses NAMED registry components throughout, several of which
 * render as native `<select>` dropdowns — fill them with `selectDropdown` using
 * slug values, not labels:
 *   - `components/primary-school` (school)        → e.g. "charles-f-broome"
 *   - `components/secondary-school` (choice1/2)   → e.g. "harrison-college"
 *   - `components/parish`          (parish)       → e.g. "st-michael"
 *   - `components/country`         (birth-country)→ e.g. "barbados"
 *   - `components/title`           (parent-title) → e.g. "mr"
 * Radios:
 *   - `components/sex` (overridden to fieldId `gender`) → `gender-male`/`-female`
 *   - `components/generic-radio` (private)              → `private-yes`/`-no`
 * Masked/pattern fields:
 *   - `components/national-id-number` enforces `^\d{6}-\d{4}$` (use "850101-0001")
 *   - `components/telephone` needs a phone-shaped value
 * `date-of-birth` is the three-part day/month/year widget (filled via fillDate);
 * the recipe's `mm/dd/yyyy` display format does not change the part IDs.
 *
 * The renderer auto-injects `check-your-answers` immediately before the
 * `declaration` step (see build-form.ts). The declaration step carries a
 * single-option `declaration-confirmed` confirmation checkbox whose input is
 * `declaration_declaration-confirmed-confirmed`.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "barbados-secondary-entrance-exam-choice";

test.describe("Barbados Secondary Entrance Exam — Choice of School — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Student Information ──────────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await expect(page.locator("h1")).toContainText("Student Information");
    // components/primary-school renders a native <select> — slug value.
    await selectDropdown(page, step, "school", "charles-f-broome");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "middle-name", "Alexander");
    await fillField(page, step, "last-name", lastName);
    // components/sex (overridden to fieldId `gender`) renders a radio.
    await selectRadio(page, step, "gender", "male");
    await fillDate(page, step, "date-of-birth", 12, 3, 2014);
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "address", faker.location.streetAddress());
    // components/parish + components/country render native <select> dropdowns.
    await selectDropdown(page, step, "parish", "st-michael");
    // id-number is optional (required:false) but masked — fill a valid shape.
    await fillField(page, step, "id-number", "850101-0001");
    await selectDropdown(page, step, "birth-country", "barbados");
    await advance(page, step);

    // ─── Parent/Guardian Information ──────────────────────────────────────────
    step = expectStep(page, "parent-guardian-information");
    await expect(page.locator("h1")).toContainText(
      "Parent/Guardian Information",
    );
    // components/title renders a native <select> — slug value.
    await selectDropdown(page, step, "parent-title", "mrs");
    await fillField(page, step, "parent-first-name", faker.person.firstName());
    await fillField(page, step, "parent-last-name", lastName);
    // national-id-number is optional here but masked — fill a valid shape.
    await fillField(page, step, "parent-id-number", "850101-0002");
    // components/telephone — phone-format validation.
    await fillField(page, step, "parent-phone", "246-418-1234");
    await advance(page, step);

    // ─── School Choices ───────────────────────────────────────────────────────
    step = expectStep(page, "school-choices");
    await expect(page.locator("h1")).toContainText("School Choices");
    await fillField(page, step, "zone", "Zone 1");
    // private is an optional radio.
    await selectRadio(page, step, "private", "no");
    // choice1 is required (components/secondary-school) — slug value.
    await selectDropdown(page, step, "choice1", "harrison-college");
    // choice2 is an optional secondary-school select; the rest are optional text.
    await selectDropdown(page, step, "choice2", "queens-college");
    await advance(page, step);

    // ─── Check Your Answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(firstName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration");
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Your application has been submitted",
      subheading:
        "Your choice of school for the Barbados Secondary Schools' Entrance Examination (BSSEE) has been submitted.",
    });
  });
});
