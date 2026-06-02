/**
 * term-leave-application.smoke.spec.ts
 *
 * Live smoke test for the "Application for Term's Leave" form
 * (formId `term-leave-application`, version 1.2.0).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid data, SUBMITS FOR REAL, and asserts the confirmation
 * screen is reached with a reference number.
 *
 * Unlike temp-teacher-application.smoke.spec.ts this form has NO file uploads —
 * every field is plain text / radio / textarea — so the run needs no AWS
 * credentials and no presign → S3 → confirm flow. The only external effect of a
 * green run is a real submission (the form has an email processor on
 * `applicant-info.email`, so the confirmation email goes to `testing@govtech.bb`).
 *
 * This spec is deliberately isolated from the normal e2e suite:
 *  - It lives under e2e/smoke and is run via playwright.smoke.config.ts only.
 *  - playwright.config.ts (the CI/local mocked suite) ignores the smoke
 *    directory, so this never runs in `test:e2e` and never creates accidental
 *    real submissions.
 *
 * Run it on demand:
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Field-ID scheme (confirmed against the deployed sandbox renderer):
 *   text/textarea : `${stepId}_${fieldId}`
 *   radio option  : `${stepId}_${fieldId}-${optionValue}`  (previousLeaveGranted-no)
 *
 * Step IDs are matched by substring (as in vendor-registration.smoke.spec.ts)
 * so the spec stays robust if a deployment ever renumbers its data steps; the
 * field-ID suffixes and the trailing steps (`check-your-answers`,
 * `declaration`, `submission-confirmation`) are stable.
 *
 * Notes from the live walkthrough:
 *  - `leave-details.comments` is REQUIRED on the deployed form (the recipe marks
 *    it optional, but the published v1.2.0 form rejects an empty value), so it
 *    is filled here.
 *  - The `declaration` step has NO confirmation checkbox — it auto-renders the
 *    applicant's name + today's date (`.form-page__applicant`) and you submit
 *    directly. (Contrast temp-teacher / vendor-registration, which gate Submit
 *    behind a declaration checkbox.)
 *  - Dates are plain text inputs, not three-part date widgets.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";

const FORM_ID = "term-leave-application";
const STEP_TIMEOUT = 15_000;

/**
 * The primary action button advances the form ("Continue" on every step,
 * "Submit" on the declaration). Matched by role + accessible name so it stays
 * robust to design-system styling changes, and so "Previous" is never matched.
 */
const primaryButton = (page: Page) =>
  page.getByRole("button", { name: /^(Continue|Submit)$/ });

/** Read the current `?step=` param. */
function currentStep(page: Page): string {
  return new URL(page.url()).searchParams.get("step") ?? "";
}

/** Assert we're on a step whose ID contains `substring` and return its ID. */
function expectStep(page: Page, substring: string): string {
  const step = currentStep(page);
  expect(step, `expected to be on a step containing "${substring}"`).toContain(
    substring,
  );
  return step;
}

/** Fill a text/textarea input addressed as `${stepId}_${suffix}`. */
async function fillField(
  page: Page,
  stepId: string,
  suffix: string,
  value: string,
): Promise<void> {
  await page.locator(`[id="${stepId}_${suffix}"]`).fill(value);
}

/** Check a radio option addressed as `${stepId}_${suffix}-${optionValue}`. */
async function selectRadio(
  page: Page,
  stepId: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(`input[type=radio][id="${stepId}_${suffix}-${optionValue}"]`)
    .check();
}

/** Click the primary button and wait until the `?step=` param changes. */
async function advance(page: Page, fromStep: string): Promise<void> {
  await primaryButton(page).click();
  await page.waitForURL((url) => url.searchParams.get("step") !== fromStep, {
    timeout: STEP_TIMEOUT,
  });
}

test.describe("Term Leave Application — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Information ───────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await expect(page.locator("h1")).toContainText("Applicant Information");
    await fillField(page, step, "school", "Bridgetown Secondary School");
    await fillField(page, step, "firstName", firstName);
    await fillField(page, step, "lastName", lastName);
    await fillField(page, step, "contactNo", faker.string.numeric(10));
    // Send the confirmation email to the monitored test inbox, not a real person.
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "post", "Mathematics Teacher");
    await fillField(page, step, "idNumber", faker.string.numeric(9));
    await advance(page, step);

    // ─── Leave Details ───────────────────────────────────────────────────────
    step = expectStep(page, "leave-details");
    await fillField(page, step, "leaveStartDate", "2026-09-01");
    await fillField(page, step, "leaveEndDate", "2026-12-15");
    // Answer "No" so the conditional `previousLeaveDetails` field stays hidden.
    await selectRadio(page, step, "previousLeaveGranted", "no");
    // Required on the deployed form (see header note).
    await fillField(page, step, "comments", "No additional comments.");
    await advance(page, step);

    // ─── Applicant Signature ─────────────────────────────────────────────────
    step = expectStep(page, "applicant-signature");
    await fillField(
      page,
      step,
      "applicantSignature",
      `${firstName} ${lastName}`,
    );
    await fillField(page, step, "signatureDate", "2026-06-02");
    await advance(page, step);

    // ─── For Official Use Only ───────────────────────────────────────────────
    step = expectStep(page, "official-use");
    await selectRadio(page, step, "recommendation", "recommend");
    await fillField(
      page,
      step,
      "officialComments",
      "Recommended for approval.",
    );
    await fillField(page, step, "principalSignature", "I. M. Principal");
    await fillField(page, step, "dateSigned", "2026-06-02");
    await advance(page, step);

    // ─── Check Your Answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(firstName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    // No confirmation checkbox: the applicant's name and today's date
    // (DD/MM/YYYY) auto-render read-only, then we submit directly.
    expectStep(page, "declaration");
    const applicant = page.locator(".form-page__applicant");
    await expect(applicant).toContainText(`${firstName} ${lastName}`);
    await expect(applicant).toContainText(/\b\d{2}\/\d{2}\/\d{4}\b/);

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
    await expect(page.getByText("Reference number")).toBeVisible();

    // The API returns the reference as a UUID — assert it is rendered.
    const body = await response.json();
    const referenceId = body?.data?.id ?? body?.id;
    expect(
      referenceId,
      "submission response should include a reference id",
    ).toBeTruthy();
    await expect(page.getByText(String(referenceId))).toBeVisible();
  });
});
