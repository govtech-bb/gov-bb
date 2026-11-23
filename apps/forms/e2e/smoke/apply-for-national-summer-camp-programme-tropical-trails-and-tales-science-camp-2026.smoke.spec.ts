/**
 * apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "National Summer Camp Science Programme
 * 2026" form (formId
 * `apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026`).
 *
 * Drives the real form, fills every visible/required field with valid data,
 * SUBMITS FOR REAL, and asserts the confirmation screen. The form has two
 * email processors (parent + MDA) and a webhook, so run it with
 * SMOKE_SUBMISSION_TOKEN set to drop them.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 * Notes (from the recipe contract):
 *  - `intro` is a content-only step (markdown, no fields).
 *  - `child-date-of-birth` must fall between 2010 and 2014.
 *  - `child-parish` (generic-select), `parent-parish` (parish) and the
 *    `relationship` component render as native `<select>` — slug values.
 *  - Conditionals kept hidden by non-triggering answers: relationship "mother",
 *    address-same-as-child "yes", every health/support/food/activities
 *    question "no", doctor "no", emergency medical care "yes".
 *  - `emergency-is-mobile` = "yes" reveals `emergency-mobile-calls`.
 *  - `can-leave-alone` = "no" reveals the repeatable `collection-persons`
 *    step; one person is added, then `addAnother` = "no".
 *  - `check-your-answers` precedes the `declaration` step, which has two
 *    single-option confirmation checkboxes.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  openSmokeForm,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID =
  "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026";

test.describe("Tropical Trails and Tales Science Camp 2026 — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await openSmokeForm(page, FORM_ID);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Apply for camp (intro) ──────────────────────────────────────────────
    let step = expectStep(page, "intro", { exact: true });
    await advance(page, step);

    // ─── Tell us about the camper ────────────────────────────────────────────
    step = expectStep(page, "child-details", { exact: true });
    await fillDate(page, step, "child-date-of-birth", 27, 3, 2012);
    await fillField(page, step, "child-first-name", faker.person.firstName());
    await fillField(page, step, "child-last-name", faker.person.lastName());
    await fillField(page, step, "child-address-line-1", "Welchman Hall");
    await selectDropdown(page, step, "child-parish", "st-thomas");
    await advance(page, step);

    // ─── Tell us about you ───────────────────────────────────────────────────
    step = expectStep(page, "your-details", { exact: true });
    await fillField(page, step, "parent-first-name", faker.person.firstName());
    await fillField(page, step, "parent-last-name", faker.person.lastName());
    // "mother" keeps `relationship-other-describe` hidden.
    await selectRadio(page, step, "relationship-to-child", "mother");
    await advance(page, step);

    // ─── Your contact details ────────────────────────────────────────────────
    step = expectStep(page, "contact-details", { exact: true });
    await fillField(page, step, "parent-email", "testing@govtech.bb");
    await fillField(page, step, "parent-mobile-phone", "246-418-1234");
    await selectRadio(page, step, "parent-mobile-calls", "yes");
    await fillField(page, step, "parent-landline", "246-421-1234");
    await fillField(page, step, "parent-work-phone", "246-535-1234");
    await advance(page, step);

    // ─── Your address ────────────────────────────────────────────────────────
    step = expectStep(page, "your-address", { exact: true });
    // "yes" keeps the parent address fields hidden.
    await selectRadio(page, step, "address-same-as-child", "yes");
    await advance(page, step);

    // ─── Health and care needs ───────────────────────────────────────────────
    step = expectStep(page, "health-information", { exact: true });
    await selectRadio(page, step, "health-condition-question", "no");
    await selectRadio(page, step, "allergies-question", "no");
    await selectRadio(page, step, "medicine-question", "no");
    await advance(page, step);

    // ─── Support needs ───────────────────────────────────────────────────────
    step = expectStep(page, "support-needs", { exact: true });
    await selectRadio(page, step, "support-help-question", "no");
    await advance(page, step);

    // ─── Meals and food ──────────────────────────────────────────────────────
    step = expectStep(page, "meals-information", { exact: true });
    await selectRadio(page, step, "food-restrictions-question", "no");
    await advance(page, step);

    // ─── Emergency contact ───────────────────────────────────────────────────
    step = expectStep(page, "emergency-contact", { exact: true });
    await fillField(
      page,
      step,
      "emergency-first-name",
      faker.person.firstName(),
    );
    await fillField(page, step, "emergency-last-name", faker.person.lastName());
    await selectDropdown(page, step, "emergency-relationship", "grandparent");
    await fillField(page, step, "emergency-phone-number", "246-418-5678");
    // "yes" reveals `emergency-mobile-calls`.
    await selectRadio(page, step, "emergency-is-mobile", "yes");
    await selectRadio(page, step, "emergency-mobile-calls", "whatsapp-only");
    await advance(page, step);

    // ─── Doctor or polyclinic ────────────────────────────────────────────────
    step = expectStep(page, "doctor-information", { exact: true });
    await selectRadio(page, step, "doctor-question", "no");
    await advance(page, step);

    // ─── Emergency medical care ──────────────────────────────────────────────
    step = expectStep(page, "emergency-medical-care", { exact: true });
    await selectRadio(page, step, "emergency-medical-care-question", "yes");
    await advance(page, step);

    // ─── Camp activities ─────────────────────────────────────────────────────
    step = expectStep(page, "camp-activities", { exact: true });
    await selectRadio(page, step, "all-activities-question", "yes");
    await advance(page, step);

    // ─── Photos and videos ───────────────────────────────────────────────────
    step = expectStep(page, "photos-and-videos", { exact: true });
    await selectRadio(page, step, "photos-videos-permission", "no");
    await advance(page, step);

    // ─── Leaving camp ────────────────────────────────────────────────────────
    step = expectStep(page, "leaving-camp", { exact: true });
    // "no" reveals the repeatable `collection-persons` step.
    await selectRadio(page, step, "can-leave-alone", "no");
    await advance(page, step);

    // ─── Who can collect the camper? (repeatable) ────────────────────────────
    step = expectStep(page, "collection-persons");
    await fillField(
      page,
      step,
      "collection-person-first-name",
      faker.person.firstName(),
    );
    await fillField(
      page,
      step,
      "collection-person-last-name",
      faker.person.lastName(),
    );
    await selectDropdown(
      page,
      step,
      "collection-person-relationship",
      "parent",
    );
    await fillField(page, step, "collection-person-phone", "246-418-9012");
    await selectRadio(page, step, "addAnother", "no");
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
    await page
      .locator(`fieldset[id="declaration_parent-guardian-confirmed"]`)
      .getByRole("checkbox")
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
      subheading: "We have sent a confirmation email",
    });
    await expect(page.getByText("What happens next")).toBeVisible();
  });
});
