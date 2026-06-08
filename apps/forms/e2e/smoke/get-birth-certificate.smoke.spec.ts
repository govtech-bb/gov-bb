/**
 * get-birth-certificate.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Get a copy of a birth certificate" form
 * (formId `get-birth-certificate`, version 1.2.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every visible required
 * field with valid data, SUBMITS FOR REAL, and asserts the confirmation screen.
 * The form has an email processor on `applicant-details.applicant-email`, so a
 * green run emails `testing@govtech.bb`.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 * Notes (from the 1.2.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `applicant-title` (components/title) and `applicant-parish`
 *    (components/parish) render as native `<select>` — use `selectDropdown`
 *    with slug values ("mr", "st-michael").
 *  - `relationship-to-person` (components/relationship) is ALSO a `<select>` —
 *    but it only renders on the `relationship-to-person` step, which is hidden
 *    by the branch chosen below.
 *  - `applicant-nid` (components/national-id) is a masked text field
 *    (`999999-9999`); we supply the `850101-0001` shape to satisfy the pattern.
 *    `passport-toggle` (components/show-hide) is left OFF, so the conditional
 *    `applicant-passport-number` stays hidden and the NID stays required.
 *  - CONDITIONAL BRANCH: `applying-for-yourself` = "yes". This keeps the two
 *    `stepConditionalOn` (value "no") steps — `relationship-to-person` and
 *    `person-details` — HIDDEN, so the applicant IS the person and we never
 *    fill the relationship select, the person name fields, or the NIS branch.
 *  - `person-is-deceased` = "no" keeps the conditional `person-death-date`
 *    (components/date) hidden.
 *  - `birth-date-of-birth` (components/date-of-birth) is a three-part
 *    day/month/year widget and must be in the past.
 *  - `parents` step: father names are optional; `mother-first-name` and
 *    `mother-last-name` are required.
 *  - `number-of-copies` (components/generic-number) is a required number input
 *    (defaults to 1, but we set it explicitly).
 *  - The renderer auto-injects `check-your-answers` before the declaration;
 *    handled with the guarded pattern.
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`. The hidden
 *    `declaration-date` field needs no interaction.
 *  - Confirmation: the `submission-confirmation` step's `title` ("Application
 *    submitted") is the h1; it sets no `description`, so the subheading falls
 *    back to the helper default "Your submission has been saved" — omitted here.
 */
import { faker } from "@faker-js/faker";
import { test } from "@playwright/test";
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

const FORM_ID = "get-birth-certificate";

test.describe("Get a Birth Certificate — Live Smoke", () => {
  // PARKED (test.fixme) — and intentionally NOT wired into deploy-sandbox.yml.
  //
  // The deployed form is a payment form (v1.3.0, EZ Pay $5/copy). The
  // submission SUCCEEDS — `POST /submissions` returns 200 with a real
  // referenceCode (GBC-…), `status: pending_payment` and a `meta.deferred`
  // EZ Pay paymentUrl — but the deployed `submission-confirmation` screen then
  // renders the generic error state ("Something went wrong — We could not
  // process your submission…") instead of the EZ Pay redirect / success
  // heading. This is the same deployed-app payment-confirmation bug as
  // get-death-certificate, tracked in #919 (not a spec defect). Un-fixme this
  // and re-add its smoke-test job once the payment-confirmation flow is fixed.
  test.fixme("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant details ───────────────────────────────────────────────────
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
      "applicant-address-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    // Masked National ID (999999-9999) — supply the `850101-0001` shape.
    await fillField(page, step, "applicant-nid", "850101-0001");
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    await advance(page, step);

    // ─── Applying for yourself? "Yes" → relationship + person-details steps stay
    //     hidden (both are stepConditionalOn value "no"). ───────────────────────
    step = expectStep(page, "applying-for-yourself", { exact: true });
    await selectRadio(page, step, "applying-for-yourself", "yes");
    await advance(page, step);

    // ─── Reason for certificate ──────────────────────────────────────────────
    step = expectStep(page, "reason-for-certificate", { exact: true });
    await fillField(
      page,
      step,
      "reason-for-ordering",
      "Replacement of a lost certificate for passport renewal.",
    );
    await advance(page, step);

    // ─── Is the person deceased? "No" → death-date stays hidden. ──────────────
    step = expectStep(page, "person-deceased", { exact: true });
    await selectRadio(page, step, "person-is-deceased", "no");
    await advance(page, step);

    // ─── Birth details ───────────────────────────────────────────────────────
    step = expectStep(page, "birth-details", { exact: true });
    await fillDate(page, step, "birth-date-of-birth", 15, 6, 1990);
    await fillField(page, step, "place-of-birth", "Bridgetown");
    await advance(page, step);

    // ─── Parents (the deployed form requires BOTH father and mother first/last
    //     names — recipe-vs-deployed drift: the recipe marks father optional,
    //     but the live renderer rejects the step without them). ──────────────
    step = expectStep(page, "parents", { exact: true });
    await fillField(page, step, "father-first-name", faker.person.firstName());
    await fillField(page, step, "father-last-name", faker.person.lastName());
    await fillField(page, step, "mother-first-name", faker.person.firstName());
    await fillField(page, step, "mother-last-name", faker.person.lastName());
    await advance(page, step);

    // ─── Order details ───────────────────────────────────────────────────────
    step = expectStep(page, "order-details", { exact: true });
    await fillField(page, step, "number-of-copies", "1");
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration) ───────────────
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
