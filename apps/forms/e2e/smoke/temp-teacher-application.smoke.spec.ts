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
 * Like vendor-registration.smoke.spec.ts this lives under e2e/smoke and runs
 * only via playwright.smoke.config.ts, so it is NEVER swept into the CI
 * `test:e2e` run (which mocks submissions and has no AWS credentials).
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
 * Field-ID scheme (confirmed against the running renderer):
 *   text/textarea : `${stepId}_${fieldId}`
 *   date parts    : `${stepId}_${fieldId}-day` / `-month` / `-year`
 *   radio option  : `${stepId}_${fieldId}-${optionValue}`  (e.g. gender-female)
 *   checkbox opt  : `${stepId}_${fieldId}-${optionValue}`  (declaration-confirmed-confirmed)
 *   file          : `${stepId}_${fieldId}`
 *
 * Repeatable steps (educational-record, qualifications, work-experience) render
 * their first instance inline with an "Add another?" radio; we fill one instance
 * and answer "No" to advance to the next step.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "../helpers/test-data";

const FORM_ID = "temp-teacher-application-barbados";
const STEP_TIMEOUT = 15_000;
const UPLOAD_TIMEOUT = 30_000;

/** The primary action button advances every step ("Continue", "Submit" on the
 *  declaration). Matched by role + accessible name so "Previous" never matches. */
const primaryButton = (page: Page) =>
  page.getByRole("button", { name: /^(Continue|Submit)$/ });

/** Read the current `?step=` param. */
function currentStep(page: Page): string {
  return new URL(page.url()).searchParams.get("step") ?? "";
}

/** Assert we're on the expected step and return its ID. */
function expectStep(page: Page, stepId: string): string {
  expect(currentStep(page), `expected to be on step "${stepId}"`).toBe(stepId);
  return stepId;
}

/** Click the primary button and wait until `?step=` changes away from `fromStep`. */
async function advance(page: Page, fromStep: string): Promise<void> {
  await primaryButton(page).click();
  await page.waitForURL((url) => url.searchParams.get("step") !== fromStep, {
    timeout: STEP_TIMEOUT,
  });
}

/** Fill a text/textarea input addressed as `${stepId}_${fieldId}`. */
async function fill(
  page: Page,
  stepId: string,
  fieldId: string,
  value: string,
): Promise<void> {
  await page.locator(`[id="${stepId}_${fieldId}"]`).fill(value);
}

/** Fill a three-part date field (`-day` / `-month` / `-year`). */
async function fillDate(
  page: Page,
  stepId: string,
  fieldId: string,
  day: number,
  month: number,
  year: number,
): Promise<void> {
  const base = `${stepId}_${fieldId}`;
  await page.locator(`input[id="${base}-day"]`).fill(String(day));
  await page.locator(`input[id="${base}-month"]`).fill(String(month));
  await page.locator(`input[id="${base}-year"]`).fill(String(year));
}

/** Select a radio option by its value suffix (`gender-female`, `addAnother-no`). */
async function selectRadio(
  page: Page,
  stepId: string,
  fieldId: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(`input[type=radio][id="${stepId}_${fieldId}-${optionValue}"]`)
    .check();
}

/**
 * Upload one file to a single-file upload field and wait until the upload is
 * CONFIRMED, not merely pending. The component renders a file's name for both
 * the "Uploading…" pending row and the confirmed row, so waiting on the name
 * alone can resolve before `confirm-upload` commits the value (and advancing
 * then trips minItems validation). The per-file "Remove {name}" button only
 * renders for a confirmed file, so wait on that instead.
 */
async function uploadOne(
  page: Page,
  stepId: string,
  fieldId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page
    .locator(`input[type=file][id="${stepId}_${fieldId}"]`)
    .setInputFiles(file);
  await expect(
    page.getByRole("button", { name: `Remove ${file.name}` }),
  ).toBeVisible({ timeout: UPLOAD_TIMEOUT });
}

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
    let step = expectStep(page, "personal-data");
    await expect(page.locator("h1")).toContainText("Personal Data");
    await fill(page, step, "firstName", firstName);
    await fill(page, step, "lastName", lastName);
    await fill(page, step, "idNumber", faker.string.numeric(9));
    await fillDate(page, step, "dateOfBirth", 15, 6, 1990);
    await selectRadio(page, step, "gender", "female");
    await fill(page, step, "address", faker.location.streetAddress());
    await fill(page, step, "parish", "St. Michael");
    await fill(page, step, "email", "testing@govtech.bb");
    await fill(page, step, "telCell", faker.string.numeric(10));
    await fill(page, step, "citizenship", "Barbadian");
    await advance(page, step);

    // ─── Educational Record (repeatable) ─────────────────────────────────────
    step = expectStep(page, "educational-record");
    await fill(page, step, "institution", "University of the West Indies");
    await fill(page, step, "country", "Barbados");
    await fill(page, step, "from", "2008");
    await fill(page, step, "to", "2012");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Qualifications (repeatable) ─────────────────────────────────────────
    step = expectStep(page, "qualifications");
    await fill(page, step, "subject", "Mathematics");
    await fill(page, step, "examiningBody", "Caribbean Examinations Council");
    await fill(page, step, "from", "2008");
    await fill(page, step, "to", "2010");
    await fill(page, step, "level", "Grade 1");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Work Experience (repeatable) ────────────────────────────────────────
    step = expectStep(page, "work-experience");
    await fill(page, step, "employer", "Bridgetown Secondary School");
    await fill(page, step, "from", "2013");
    await fill(page, step, "to", "2020");
    await fill(page, step, "position", "Mathematics Teacher");
    await fill(page, step, "duties", "Teaching mathematics to forms 1-5");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Other Related Information (all optional) ────────────────────────────
    step = expectStep(page, "other-related-information");
    await advance(page, step);

    // ─── Reference 1 ─────────────────────────────────────────────────────────
    step = expectStep(page, "reference-1");
    await fill(page, step, "ref1Name", "John Principal");
    await fill(page, step, "ref1Address", "2 School Road, Bridgetown");
    await fill(page, step, "ref1Occupation", "School Principal");
    await fill(page, step, "ref1Contact", faker.string.numeric(10));
    await advance(page, step);

    // ─── Reference 2 ─────────────────────────────────────────────────────────
    step = expectStep(page, "reference-2");
    await fill(page, step, "ref2Name", "Mary Supervisor");
    await fill(page, step, "ref2Address", "3 Office Lane, Bridgetown");
    await fill(page, step, "ref2Occupation", "Education Officer");
    await fill(page, step, "ref2Contact", faker.string.numeric(10));
    await advance(page, step);

    // ─── Upload your documents (real S3 upload) ──────────────────────────────
    step = expectStep(page, "upload-documents");
    // certificatesUpload: one file is enough.
    await uploadOne(page, step, "certificatesUpload", TEST_PNG);
    // testimonialsUpload: exactly two files required.
    await uploadOne(page, step, "testimonialsUpload", TEST_PNG_2);
    await uploadOne(page, step, "testimonialsUpload", TEST_PNG_3);
    await advance(page, step);

    // ─── Check your answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(firstName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration");
    // #456: the applicant's name (from the earlier name fields) and today's
    // date (DD/MM/YYYY) auto-render read-only on the declaration step.
    const applicant = page.locator(".form-page__applicant");
    await expect(applicant).toContainText(`${firstName} ${lastName}`);
    await expect(applicant).toContainText(/\b\d{2}\/\d{2}\/\d{4}\b/);
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // Assert the real submission API call succeeds (HTTP 2xx) on submit.
    const submissionResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/submissions") && res.request().method() === "POST",
      { timeout: STEP_TIMEOUT },
    );
    await primaryButton(page).click();

    const response = await submissionResponse;
    expect(
      response.ok(),
      `POST /submissions failed with ${response.status()}`,
    ).toBe(true);

    // ─── Submission Confirmation ─────────────────────────────────────────────
    await page.waitForURL(
      (url) => url.searchParams.get("step") === "submission-confirmation",
      { timeout: STEP_TIMEOUT },
    );
    await expect(page.locator("h1")).toContainText("Submission Confirmation");
    await expect(
      page.getByText("Your submission has been saved"),
    ).toBeVisible();
  });
});
