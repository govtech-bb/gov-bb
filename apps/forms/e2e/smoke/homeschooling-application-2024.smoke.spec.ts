/**
 * homeschooling-application-2024.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Homeschooling Application Form" (formId
 * `homeschooling-application-2024`, version 1.3.0).
 *
 * Recipe 1.3.0 fixes the conditional bug that hid `previous-school-info`: field
 * IDs are now kebab-case (`previously-in-school`, `email-address`, …) so they no
 * longer collide with the `_` composite-key separator. The recipe's declaration
 * is a single explicit `declaration` step carrying a single-option
 * `declaration-confirmed` checkbox (no separate `declaration-and-signature`
 * step), and the renderer auto-injects `check-your-answers` immediately before
 * it (see build-form.ts).
 *
 * Shared helpers live in ../helpers/smoke.
 *
 * Notes (from the 1.3.0 recipe contract):
 *  - Field IDs are `${stepId}_${fieldId}` (kebab-case fieldIds).
 *  - `title` and `applicant-parish` render as native `<select>` (required by the
 *    registry defaults the recipe doesn't override) — use `selectDropdown` with
 *    slug values ("mr", "st-michael").
 *  - `student-dob` is a `date-of-birth` (three-part day/month/year widget) and
 *    must be in the past.
 *  - `student-info` and `instructor-info` are repeatable (Add another? → No).
 *  - `previous-schooling.previously-in-school` = "no" keeps the conditional
 *    `previous-school-info` hidden; `following-national-curriculum` = "yes"
 *    keeps the conditional `curriculum-attachment` upload hidden.
 *  - `declaration` is the explicit final step; its single-option checkbox input
 *    is `declaration_declaration-confirmed-confirmed`.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import { TEST_PNG, TEST_PNG_2 } from "../helpers/test-data";
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

const FORM_ID = "homeschooling-application-2024";

test.describe("Homeschooling Application — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Information ───────────────────────────────────────────────
    let step = expectStep(page, "applicant-info", { exact: true });
    await expect(page.locator("h1")).toContainText("Applicant Information");
    await selectDropdown(page, step, "title", "mr");
    await fillField(page, step, "first-name", faker.person.firstName());
    await fillField(page, step, "last-name", faker.person.lastName());
    await fillField(
      page,
      step,
      "applicant-address",
      faker.location.streetAddress(),
    );
    await selectDropdown(page, step, "applicant-parish", "st-michael");
    await fillField(page, step, "contact-numbers", "246-418-1234");
    await fillField(page, step, "email-address", "testing@govtech.bb");
    await selectRadio(page, step, "resident-status", "resident");
    await advance(page, step);

    // ─── Student Information (repeatable) ────────────────────────────────────
    step = expectStep(page, "student-info", { exact: true });
    await fillField(page, step, "student-name", faker.person.fullName());
    await fillDate(page, step, "student-dob", 12, 3, 2015);
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Previous Schooling (answer "No" to keep the conditional hidden) ─────
    step = expectStep(page, "previous-schooling", { exact: true });
    await selectRadio(page, step, "previously-in-school", "no");
    await advance(page, step);

    // ─── Instructor/Tutor Information (repeatable) ───────────────────────────
    step = expectStep(page, "instructor-info", { exact: true });
    await fillField(page, step, "instructor-name", faker.person.fullName());
    await fillField(
      page,
      step,
      "instructor-qualifications",
      "B.Ed. Primary Education",
    );
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Curriculum and Attachments ──────────────────────────────────────────
    step = expectStep(page, "curriculum-attachments", { exact: true });
    await uploadOne(page, step, "timetable-attachment", TEST_PNG);
    // "Yes" keeps the conditional `curriculum-attachment` upload hidden.
    await selectRadio(page, step, "following-national-curriculum", "yes");
    await uploadOne(page, step, "tutor-qualifications-attachment", TEST_PNG_2);
    await advance(page, step);

    // ─── Check your answers (auto-injected before declaration) ───────────────
    step = expectStep(page, "check-your-answers", { exact: true });
    await expect(page.locator("h1")).toContainText("Check your answers");
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    step = expectStep(page, "declaration", { exact: true });
    await page
      .locator(`input[id="declaration_declaration-confirmed-confirmed"]`)
      .check();

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, { heading: "Submission Confirmation" });
  });
});
