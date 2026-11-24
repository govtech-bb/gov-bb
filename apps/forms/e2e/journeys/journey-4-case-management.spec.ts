/**
 * Journey 4 (#3011/#3861): a submission reaches case-management (CaMS) and back.
 *
 * Runs post-deploy against STAGING (its own `playwright.journey.config.ts`, NOT
 * the smoke config — it must never be swept into `test:smoke`), gating nothing
 * yet: the CaMS read + removeTestCase endpoints are a PROPOSED contract that is
 * not provisioned, so the CI job SOFT-SKIPS (exit 0) until `E2E_CAMS_API_KEY` is
 * set. See the fail-closed re-arming note in deploy-staging.yml.
 *
 * The journey, against a DEDICATED non-public test service (`e2e-j4-case-check`)
 * whose webhook maps to a reserved `E2E_`-prefixed test programme (ADR 0087):
 *   1. Open the preview form with PREVIEW_TOKEN (it is non-public) and walk it,
 *      uploading one small in-memory file.
 *   2. Submit for real with the smoke token (X-Smoke-Submission, set on the
 *      journey config): the API drops every processor EXCEPT the mapped webhook
 *      to the `E2E_` test programme, which fires to staging's non-prod CaMS.
 *   3. Capture the submission's `referenceCode`.
 *   4. Poll CaMS for a case with that code (the webhook is async over SQS, so
 *      the case lands within a short budget, not immediately).
 *   5. Assert the case's `code` equals the reference and the uploaded file was
 *      copied across.
 * A `finally` then removes the test case so CaMS is left with no residue. A
 * cleanup failure on an otherwise-green run still throws RED (a test case left
 * behind is residue), mirroring Journey 3's bodyError/resetError.
 *
 * Why the smoke token here (and why it is safe): ADR 0087's amendment lets a
 * smoke submission dispatch a mapped webhook ONLY when the programme code it
 * sends is a reserved `E2E_` test code. Every other side-effect (email, payment,
 * any webhook on a real programme) stays suppressed, and CaMS registers every
 * `E2E_` programme as `isTest`, so the case created is removable, never real.
 *
 * Required env:
 *   SMOKE_BASE_URL          forms base URL (also the journey config's baseURL)
 *   SMOKE_LANDING_URL       landing base URL (asserted present for parity with
 *                           the smoke suite; J4 enters via the preview token, so
 *                           it does not follow a landing Start link)
 *   PREVIEW_TOKEN           opens the non-public test form (#1848)
 *   SMOKE_SUBMISSION_TOKEN  marks the submit as a smoke submission (ADR 0087)
 *   E2E_CAMS_BASE_URL       CaMS base URL (non-prod on staging)
 *   E2E_CAMS_API_KEY        CaMS x-api-key for the E2E_ test programme
 */
import { expect, test } from "@playwright/test";
import { TEST_PNG } from "../helpers/test-data";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { getCaseByCode, removeTestCase } from "../helpers/cams-client";

const FORM_ID = "e2e-j4-case-check";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 4 needs ${name} to be set`);
  return value;
}

// The webhook is async over SQS, so the case lands after the confirmation, not
// with it. Poll on a fixed short interval with a budget sized to a cold path.
const CASE_TIMEOUT = 90_000;
const POLL_INTERVAL = 5_000;

test.describe("Journey 4 — a submission reaches case management and back", () => {
  test("submits the test form and follows it into CaMS, then cleans up", async ({
    page,
  }) => {
    test.setTimeout(180_000); // walk + submit + ~90s case poll, with headroom.

    const formsUrl = required("SMOKE_BASE_URL");
    required("SMOKE_LANDING_URL");
    const previewToken = required("PREVIEW_TOKEN");
    required("SMOKE_SUBMISSION_TOKEN");
    const camsBase = required("E2E_CAMS_BASE_URL");
    const camsApiKey = required("E2E_CAMS_API_KEY");

    // The form is non-public — enter it directly with the preview token (landing
    // hides Start for a private form, #1848), on the config's baseURL host.
    await page.goto(
      `${formsUrl.replace(/\/$/, "")}/forms/${FORM_ID}?preview=${encodeURIComponent(previewToken)}`,
    );
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Your details (personal-information block + email + telephone) ─────────
    let step = expectStep(page, "details", { exact: true });
    await expect(page.locator("h1")).toContainText("Your details");
    await selectDropdown(page, step, "title", "mr");
    await fillField(page, step, "first-name", "E2E");
    await fillField(page, step, "last-name", "CaseCheck");
    await selectRadio(page, step, "sex", "male");
    await selectDropdown(page, step, "nationality", "barbadian");
    await fillField(page, step, "email", "testing@govtech.bb");
    await fillField(page, step, "telephone", "246-418-1234");
    await advance(page, step);

    // ─── Supporting document (one required single-file upload) ────────────────
    step = expectStep(page, "documents", { exact: true });
    await uploadOne(page, step, "supporting-document", TEST_PNG);
    await advance(page, step);

    // ─── Check your answers (review step, no fields) ──────────────────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ──────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`fieldset[id="declaration_declaration-confirmed"]`)
      .getByRole("checkbox")
      .check();

    // ─── Submit + capture the reference code ──────────────────────────────────
    const response = await submitAndConfirm(page, { heading: /submitted/i });
    const body = await response.json();
    const referenceCode: string | undefined =
      body?.data?.referenceCode ?? body?.referenceCode;
    expect(
      referenceCode,
      "submission response should include a referenceCode",
    ).toBeTruthy();
    const code = referenceCode as string;

    let bodyError: unknown;
    try {
      // ─── Follow the submission into CaMS (async over SQS) ───────────────────
      // Poll until the case code shows up (null while the webhook is in flight).
      await expect
        .poll(
          async () => (await getCaseByCode(camsBase, camsApiKey, code))?.code,
          { timeout: CASE_TIMEOUT, intervals: [POLL_INTERVAL] },
        )
        .toBe(code);

      const found = await getCaseByCode(camsBase, camsApiKey, code);
      expect(
        found,
        "case should exist in CaMS after the webhook",
      ).not.toBeNull();
      expect(found!.code, "CaMS case code should match the reference").toBe(
        code,
      );
      expect(
        found!.files.map((f) => f.name),
        "the uploaded file should be copied onto the CaMS case",
      ).toContain(TEST_PNG.name);
    } catch (err) {
      bodyError = err;
    }

    // Always attempt to remove the test case so CaMS is left with no residue.
    let cleanupError: unknown;
    try {
      await removeTestCase(camsBase, camsApiKey, code);
    } catch (err) {
      cleanupError = err;
    }

    // Surface the original failure first — it's the most informative. But a
    // cleanup failure on an otherwise-green run must still go RED: a test case
    // left in CaMS is residue, so a silent warning is not enough.
    if (bodyError) throw bodyError;
    if (cleanupError) {
      throw new Error(
        `J4 could not remove test case ${code} from CaMS — it may be left behind: ${cleanupError}`,
      );
    }
  });
});
