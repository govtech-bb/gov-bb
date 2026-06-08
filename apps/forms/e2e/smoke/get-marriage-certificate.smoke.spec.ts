/**
 * get-marriage-certificate.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Get a Marriage Certificate" form (formId
 * `get-marriage-certificate`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible/required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `applicant-details.applicant-email`, so a
 * green run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant-title` (components/title) and `applicant-parish`
 *    (components/parish) render as native `<select>` — use `selectDropdown`
 *    with slug values ("mr", "st-michael").
 *  - Passport toggles (`passport-toggle`, `husband-passport-toggle`,
 *    `wife-passport-toggle`) are left OFF, so we fill the National ID number on
 *    each person and the conditional `*-passport-number` fields stay hidden.
 *  - `applying-for-yourself` = "yes" satisfies the `reason-for-requesting`
 *    step's `stepConditionalOn` (visible only when "no"), so that whole step is
 *    skipped — keeping the optional `relationship-other-description` conditional
 *    out of play entirely.
 *  - `date-of-marriage` is a `generic-date` (three-part day/month/year widget)
 *    and is set to a valid date in the past.
 *  - `applicant-is-barbados-national` = "yes" makes `order-details` show the
 *    `number-of-copies-national` field (conditional on "yes") and keeps
 *    `number-of-copies-non-national` hidden.
 *  - `check-your-answers` is an explicit recipe step (guarded advance).
 *  - `declaration` is the explicit final step; its single-option confirmation
 *    checkbox input is `declaration_declaration-confirmed-confirmed`.
 *  - The `submission-confirmation` step title is "Application submitted" and the
 *    recipe sets no processing message, so the subheading falls back to the
 *    helper default ("Your submission has been saved") and is omitted here.
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

const FORM_ID = "get-marriage-certificate";

test.describe("Get a Marriage Certificate — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Tell us about yourself ──────────────────────────────────────────────
    let step = expectStep(page, "applicant-details", { exact: true });
    await selectDropdown(page, step, "applicant-title", "mr");
    await fillField(
      page,
      step,
      "applicant-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillField(
      page,
      step,
      "applicant-address-line-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    await fillField(page, step, "applicant-id-number", faker.string.numeric(9));
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    await selectRadio(page, step, "applicant-is-barbados-national", "yes");
    await advance(page, step);

    // ─── Are you applying for yourself? ("Yes" skips reason-for-requesting) ───
    step = expectStep(page, "applying-for-yourself", { exact: true });
    await selectRadio(page, step, "applying-for-yourself", "yes");
    await advance(page, step);

    // ─── Tell us about the husband (ID number; passport toggle left off) ─────
    step = expectStep(page, "husband-details", { exact: true });
    await fillField(page, step, "husband-first-name", faker.person.firstName());
    await fillField(page, step, "husband-last-name", faker.person.lastName());
    await fillField(page, step, "husband-id-number", faker.string.numeric(9));
    await advance(page, step);

    // ─── Tell us about the wife (ID number; passport toggle left off) ────────
    step = expectStep(page, "wife-details", { exact: true });
    await fillField(page, step, "wife-first-name", faker.person.firstName());
    await fillField(page, step, "wife-maiden-name", faker.person.lastName());
    await fillField(page, step, "wife-id-number", faker.string.numeric(9));
    await advance(page, step);

    // ─── Provide your marriage details (date in the past) ────────────────────
    step = expectStep(page, "marriage-details", { exact: true });
    await fillDate(page, step, "date-of-marriage", 14, 2, 2015);
    await fillField(
      page,
      step,
      "place-of-marriage",
      "St. Michael, St. Mary's Church",
    );
    await advance(page, step);

    // ─── How many copies? (national field shown for a Barbados national) ─────
    step = expectStep(page, "order-details", { exact: true });
    await fillField(page, step, "number-of-copies-national", "1");
    await advance(page, step);

    // ─── Check your answers (explicit recipe step) ───────────────────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
    });
  });
});
