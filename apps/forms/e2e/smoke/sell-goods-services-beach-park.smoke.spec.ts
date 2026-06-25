/**
 * sell-goods-services-beach-park.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Apply to sell goods or services at a
 * beach or park" form (formId `sell-goods-services-beach-park`, version 1.2.0).
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
 *  - Field IDs are `${stepId}_${fieldId}`.
 *  - `applicant-title`, `applicant-nationality`, `applicant-parish`,
 *    `prof-ref-parish`, `pers-ref-parish` and the testimonial relationship /
 *    parish fields render as native `<select>` (registry defaults + custom
 *    option lists) — use `selectDropdown` with slug values.
 *  - `applicant-dob` is a `date-of-birth` three-part widget; must be in the past.
 *  - `passport-toggle` is a show/hide left OFF so the conditional
 *    `applicant-passport-number` stays hidden and `applicant-nid` is required —
 *    the spec fills the National ID and leaves the toggle alone.
 *  - `goods-or-services` = "services" routes to the `services-details` step and
 *    keeps the `goods-details` step hidden (it is stepConditionalOn = "goods").
 *  - `document-uploads` has a single-file `police-certificate` (via uploadOne)
 *    and a multi-file `passport-photos` upload requiring 2 files (via
 *    uploadMany) — the live field enforces a minItems of 2.
 *  - `declaration` is the explicit final step; its single-option confirmation
 *    checkbox input is `declaration_declaration-confirmed-confirmed`. The
 *    renderer auto-injects `check-your-answers` immediately before it.
 *  - The `submission-confirmation` step has title "Application submitted" and no
 *    description, so the confirmation heading is "Application submitted" and the
 *    subheading falls back to the default "Your submission has been saved"
 *    (omitted here so submitAndConfirm asserts the default).
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import { TEST_PNG, TEST_PNG_2, TEST_PNG_3 } from "../helpers/test-data";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  submitAndConfirm,
  uploadOne,
  uploadMany,
} from "../helpers/smoke";

const FORM_ID = "sell-goods-services-beach-park";

test.describe("Sell Goods or Services at a Beach or Park — Live Smoke", () => {
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
    await fillField(
      page,
      step,
      "applicant-middle-name",
      faker.person.middleName(),
    );
    await fillField(page, step, "applicant-last-name", faker.person.lastName());
    await fillDate(page, step, "applicant-dob", 15, 6, 1990);
    await selectDropdown(page, step, "applicant-nationality", "barbadian");
    await fillField(page, step, "applicant-nid", faker.string.numeric(10));
    // Leave `passport-toggle` OFF so the conditional passport field stays hidden.
    await fillField(page, step, "applicant-email", "testing@govtech.bb");
    await fillField(page, step, "applicant-telephone", "246-418-1234");
    await fillField(
      page,
      step,
      "applicant-address-1",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    await advance(page, step);

    // ─── Would you like to sell goods or services? ───────────────────────────
    // "services" routes to `services-details` and keeps `goods-details` hidden.
    step = expectStep(page, "goods-or-services", { exact: true });
    await page
      .locator(`input[type=radio][id="${step}_goods-or-services-services"]`)
      .check();
    await advance(page, step);

    // ─── Tell us about your services ─────────────────────────────────────────
    step = expectStep(page, "services-details", { exact: true });
    await fillField(
      page,
      step,
      "services-description",
      "20-minute jet ski rides",
    );
    await fillField(page, step, "services-location", "Brownes Beach");
    await advance(page, step);

    // ─── Professional referee ────────────────────────────────────────────────
    step = expectStep(page, "professional-referee", { exact: true });
    await fillField(
      page,
      step,
      "prof-ref-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "prof-ref-last-name", faker.person.lastName());
    await fillField(page, step, "prof-ref-relationship", "Former manager");
    await fillField(page, step, "prof-ref-email", "testing@govtech.bb");
    await fillField(page, step, "prof-ref-telephone", "246-418-1234");
    await fillField(
      page,
      step,
      "prof-ref-address-1",
      faker.location.streetAddress(),
    );
    // Deployed form requires `*-address-2` on every referee/testimonial step
    // (recipe-vs-deployed drift — the recipe marks line 2 optional).
    await fillField(
      page,
      step,
      "prof-ref-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "prof-ref-parish", "st-michael");
    await advance(page, step);

    // ─── Personal referee ────────────────────────────────────────────────────
    step = expectStep(page, "personal-referee", { exact: true });
    await fillField(
      page,
      step,
      "pers-ref-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "pers-ref-last-name", faker.person.lastName());
    await fillField(page, step, "pers-ref-relationship", "Community mentor");
    await fillField(page, step, "pers-ref-email", "testing@govtech.bb");
    await fillField(page, step, "pers-ref-telephone", "246-418-1234");
    await fillField(
      page,
      step,
      "pers-ref-address-1",
      faker.location.streetAddress(),
    );
    await fillField(
      page,
      step,
      "pers-ref-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "pers-ref-parish", "st-michael");
    await advance(page, step);

    // ─── First testimonial ───────────────────────────────────────────────────
    step = expectStep(page, "first-testimonial", { exact: true });
    await fillField(
      page,
      step,
      "testimonial1-first-name",
      faker.person.firstName(),
    );
    await fillField(
      page,
      step,
      "testimonial1-last-name",
      faker.person.lastName(),
    );
    await selectDropdown(page, step, "testimonial1-relationship", "friend");
    await fillField(
      page,
      step,
      "testimonial1-address-1",
      faker.location.streetAddress(),
    );
    await fillField(
      page,
      step,
      "testimonial1-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "testimonial1-parish", "st-michael");
    await fillField(
      page,
      step,
      "testimonial1-text",
      "A reliable, hardworking and honest person of good character.",
    );
    await advance(page, step);

    // ─── Second testimonial ──────────────────────────────────────────────────
    step = expectStep(page, "second-testimonial", { exact: true });
    await fillField(
      page,
      step,
      "testimonial2-first-name",
      faker.person.firstName(),
    );
    await fillField(
      page,
      step,
      "testimonial2-last-name",
      faker.person.lastName(),
    );
    await selectDropdown(page, step, "testimonial2-relationship", "neighbour");
    await fillField(
      page,
      step,
      "testimonial2-address-1",
      faker.location.streetAddress(),
    );
    await fillField(
      page,
      step,
      "testimonial2-address-2",
      faker.location.secondaryAddress(),
    );
    await selectDropdown(page, step, "testimonial2-parish", "st-michael");
    await fillField(
      page,
      step,
      "testimonial2-text",
      "Trustworthy and dependable; a valued member of the community.",
    );
    await advance(page, step);

    // ─── Upload supporting documents ─────────────────────────────────────────
    step = expectStep(page, "document-uploads", { exact: true });
    await uploadOne(page, step, "police-certificate", TEST_PNG);
    // passport-photos is a multi-file field with a minItems of 2 on the live
    // form ("At least 2 photos are required") — upload two distinct files.
    await uploadMany(page, step, "passport-photos", [TEST_PNG_2, TEST_PNG_3]);
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration) ───────────────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    // The deployed confirmation screen renders the generic "Thank you for your
    // application" heading rather than the recipe's `submission-confirmation`
    // title ("Application submitted") — match what the live renderer shows.
    await submitAndConfirm(page, {
      heading: "Thank you for your application",
    });
  });
});
