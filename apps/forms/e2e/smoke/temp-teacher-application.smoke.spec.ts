/**
 * temp-teacher-application.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Application for the Post of Temporary
 * Teacher" form (formId `temp-teacher-application-barbados`, version 1.2.0).
 *
 * It drives the REAL form end-to-end: fills every step with valid data, uploads
 * real files through the presign → PUT-to-S3 → confirm flow, SUBMITS FOR REAL,
 * and asserts the submission-confirmation screen is reached.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts, so it is NEVER swept into the CI `test:e2e` run
 * (which mocks submissions and has no AWS credentials). Shared step/field
 * helpers live in ../helpers/smoke.
 *
 * Run it on demand:
 *   # Against the local stack (Vite on :3000 + API on :3001 pointed at a real
 *   # S3 bucket via `aws sso login`):
 *   SMOKE_BASE_URL=http://localhost:3000 pnpm --filter @govtech-bb/forms test:smoke
 *
 *   # Against a deployed environment that has this form published:
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * File uploads: each upload field is a single-file <input type=file>; a field
 * that needs N files (testimonials needs exactly 2) accumulates them by setting
 * the input once per file and waiting for each name to render before the next.
 * The upload is async (presign → S3 PUT → confirm) so we wait on the rendered
 * filename, which only appears once `confirm-upload` resolves.
 *
 * Step IDs are matched exactly here (the deployed form keeps the recipe's bare
 * step IDs). Repeatable steps (educational-record, qualifications,
 * work-experience) render their first instance inline with an "Add another?"
 * radio; we fill one instance and answer "No" to advance to the next step.
 *
 * Field-id suffixes are kebab-case (`first-name`, not `firstName`) since the
 * #741/#745 recipe id migration kebab-cased every checked-in recipe version.
 * (`addAnother` is unaffected — it's the runtime-injected repeatable radio,
 * not a recipe field id.)
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "../helpers/test-data";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";

const FORM_ID = "temp-teacher-application-barbados";

test.describe("Temporary Teacher Application — Live Smoke", () => {
  test("fills, uploads, submits the real form and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Personal Data ───────────────────────────────────────────────────────
    let step = expectStep(page, "personal-data", { exact: true });
    await expect(page.locator("h1")).toContainText("Personal Data");
    await fillField(page, step, "first-name", firstName);
    await fillField(page, step, "last-name", lastName);
    // `components/national-id-number` enforces the 850101-0001 shape
    // (`^\d{6}-\d{4}$`), so random digits won't validate.
    await fillField(page, step, "id-number", "850101-0001");
    await fillDate(page, step, "date-of-birth", 15, 6, 1990);
    await selectRadio(page, step, "gender", "female");
    await fillField(page, step, "address", faker.location.streetAddress());
    // parish and citizenship render as native <select> dropdowns
    // (components/parish, components/country) — option values are slugs.
    await selectDropdown(page, step, "parish", "st-michael");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "tel-cell", "246-418-1234");
    // marital-status is a required <select> (components/marital-status).
    await selectDropdown(page, step, "marital-status", "single");
    await selectDropdown(page, step, "citizenship", "barbados");
    await advance(page, step);

    // ─── Educational Record (repeatable) ─────────────────────────────────────
    step = expectStep(page, "educational-record", { exact: true });
    await fillField(page, step, "institution", "University of the West Indies");
    await selectDropdown(page, step, "country", "barbados");
    await fillField(page, step, "education-start-year", "2008");
    await fillField(page, step, "education-end-year", "2012");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Qualifications (repeatable) ─────────────────────────────────────────
    step = expectStep(page, "qualifications", { exact: true });
    await fillField(page, step, "subject", "Mathematics");
    await fillField(
      page,
      step,
      "examining-body",
      "Caribbean Examinations Council",
    );
    await fillField(page, step, "qualification-year", "2010");
    await fillField(page, step, "level", "Grade 1");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Work Experience (repeatable) ────────────────────────────────────────
    step = expectStep(page, "work-experience", { exact: true });
    await fillField(page, step, "employer", "Bridgetown Secondary School");
    // #825 renamed the year fieldIds (`from`/`to` → `work-start-year`/
    // `work-end-year`) in the published recipe.
    await fillField(page, step, "work-start-year", "2013");
    await fillField(page, step, "work-end-year", "2020");
    await fillField(page, step, "position", "Mathematics Teacher");
    await fillField(page, step, "duties", "Teaching mathematics to forms 1-5");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Other Related Information (all optional) ────────────────────────────
    step = expectStep(page, "other-related-information", { exact: true });
    await advance(page, step);

    // ─── Reference 1 ─────────────────────────────────────────────────────────
    step = expectStep(page, "reference-1", { exact: true });
    await fillField(page, step, "ref1-name", "John Principal");
    await fillField(page, step, "ref1-address", "2 School Road, Bridgetown");
    await fillField(page, step, "ref1-occupation", "School Principal");
    await fillField(page, step, "ref1-contact", "246-418-1234");
    await advance(page, step);

    // ─── Reference 2 ─────────────────────────────────────────────────────────
    step = expectStep(page, "reference-2", { exact: true });
    await fillField(page, step, "ref2-name", "Mary Supervisor");
    await fillField(page, step, "ref2-address", "3 Office Lane, Bridgetown");
    await fillField(page, step, "ref2-occupation", "Education Officer");
    await fillField(page, step, "ref2-contact", "246-418-1234");
    await advance(page, step);

    // ─── Upload your documents (real S3 upload) ──────────────────────────────
    step = expectStep(page, "upload-documents", { exact: true });
    // certificates-upload: one file is enough.
    await uploadOne(page, step, "certificates-upload", TEST_PNG);
    // testimonials-upload: exactly two files required.
    await uploadOne(page, step, "testimonials-upload", TEST_PNG_2);
    await uploadOne(page, step, "testimonials-upload", TEST_PNG_3);
    await advance(page, step);

    // ─── Check your answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers", { exact: true });
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(firstName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });
    // #456: the applicant's name (from the earlier name fields) and today's
    // date (DD/MM/YYYY) auto-render read-only on the declaration step.
    const applicant = page.locator(".form-page__applicant");
    await expect(applicant).toContainText(`${firstName} ${lastName}`);
    await expect(applicant).toContainText(/\b\d{2}\/\d{2}\/\d{4}\b/);
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    // The recipe overrides the confirmation title/description (v1.3.0) and
    // renders recipe-authored markdown ("What you need to know") below.
    await submitAndConfirm(page, {
      heading: "Your application to be a temporary teacher has been submitted.",
      subheading: "Thank you. We have received your application.",
    });
    await expect(
      page.getByRole("heading", { name: "What you need to know" }),
    ).toBeVisible();
  });
});
