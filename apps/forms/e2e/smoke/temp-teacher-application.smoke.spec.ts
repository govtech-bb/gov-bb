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
    await fillField(page, step, "firstName", firstName);
    await fillField(page, step, "lastName", lastName);
    await fillField(page, step, "idNumber", faker.string.numeric(9));
    await fillDate(page, step, "dateOfBirth", 15, 6, 1990);
    await selectRadio(page, step, "gender", "female");
    await fillField(page, step, "address", faker.location.streetAddress());
    await fillField(page, step, "parish", "St. Michael");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telCell", faker.string.numeric(10));
    await fillField(page, step, "citizenship", "Barbadian");
    await advance(page, step);

    // ─── Educational Record (repeatable) ─────────────────────────────────────
    step = expectStep(page, "educational-record", { exact: true });
    await fillField(page, step, "institution", "University of the West Indies");
    await fillField(page, step, "country", "Barbados");
    await fillField(page, step, "educational-dates", "2008-2012");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Qualifications (repeatable) ─────────────────────────────────────────
    step = expectStep(page, "qualifications", { exact: true });
    await fillField(page, step, "subject", "Mathematics");
    await fillField(
      page,
      step,
      "examiningBody",
      "Caribbean Examinations Council",
    );
    await fillField(page, step, "qualification-date", "2010");
    await fillField(page, step, "level", "Grade 1");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Work Experience (repeatable) ────────────────────────────────────────
    step = expectStep(page, "work-experience", { exact: true });
    await fillField(page, step, "employer", "Bridgetown Secondary School");
    await fillField(page, step, "from", "2013");
    await fillField(page, step, "to", "2020");
    await fillField(page, step, "position", "Mathematics Teacher");
    await fillField(page, step, "duties", "Teaching mathematics to forms 1-5");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Other Related Information (all optional) ────────────────────────────
    step = expectStep(page, "other-related-information", { exact: true });
    await advance(page, step);

    // ─── References ──────────────────────────────────────────────────────────
    step = expectStep(page, "references", { exact: true });
    await fillField(page, step, "ref1Name", "John Principal");
    await fillField(page, step, "ref1Address", "2 School Road, Bridgetown");
    await fillField(page, step, "ref1Occupation", "School Principal");
    await fillField(page, step, "ref1Contact", faker.string.numeric(10));
    await fillField(page, step, "ref2Name", "Mary Supervisor");
    await fillField(page, step, "ref2Address", "3 Office Lane, Bridgetown");
    await fillField(page, step, "ref2Occupation", "Education Officer");
    await fillField(page, step, "ref2Contact", faker.string.numeric(10));
    await advance(page, step);

    // ─── Upload your documents (real S3 upload) ──────────────────────────────
    step = expectStep(page, "upload-documents", { exact: true });
    // certificatesUpload: one file is enough.
    await uploadOne(page, step, "certificatesUpload", TEST_PNG);
    // testimonialsUpload: exactly two files required.
    await uploadOne(page, step, "testimonialsUpload", TEST_PNG_2);
    await uploadOne(page, step, "testimonialsUpload", TEST_PNG_3);
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
    await submitAndConfirm(page, { heading: "Submission Confirmation" });
  });
});
