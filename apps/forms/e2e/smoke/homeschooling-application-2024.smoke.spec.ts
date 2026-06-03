/**
 * homeschooling-application-2024.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Homeschooling Application Form" (formId
 * `homeschooling-application-2024`, version 1.2.0).
 *
 * ⚠️ test.fixme — BLOCKED by a recipe bug on the deployed form, AND not fully
 * verifiable end-to-end yet. Two issues:
 *
 *  1. BLOCKER: `declaration-and-signature.acknowledge_requirements` is served as
 *     a `checkbox` with `required: true` but EMPTY `options: []`. The
 *     field-renderer draws one checkbox per option, so it renders no checkable
 *     input while validation demands a value — the final step can never be
 *     completed through the UI. Fix the recipe (a single-option checkbox, like
 *     the temp-teacher declaration's `confirmed` option) before enabling.
 *  2. The required uploads (`timetable_attachment`, `tutor_qualifications_attachment`)
 *     only accept `.pdf/.doc/.docx/.xls/.xlsx` — the existing test fixtures are
 *     PNG/txt only, so a matching document fixture is needed (see helpers/test-data).
 *
 * The body below is a best-effort happy path written from the deployed
 * contract; the steps up to the acknowledgement are expected to work, but the
 * acknowledgement + submit could not be verified live. Remove the `test.fixme`
 * and finish the upload-fixture + acknowledge-checkbox wiring once the recipe is
 * fixed and deployed. Tracked in the session summary
 * 2026-06-03-add-form-smoke-tests.md.
 *
 * Shared helpers live in ../helpers/smoke.
 *
 * Notes (from the deployed contract):
 *  - Field IDs are `${stepId}_${fieldId}`; the deployed form marks most fields
 *    required (recipe-vs-deployed drift).
 *  - `student-info` and `instructor-info` are repeatable (Add another? → No).
 *  - `previous-schooling.previously_in_school` = "no" keeps the conditional
 *    `previous_school_info` hidden; `following_national_curriculum` = "yes"
 *    keeps the conditional `curriculum_attachment` upload hidden.
 *  - `signature_date` is a real `date` field (three-part day/month/year widget),
 *    unlike the plain-text date fields on the other forms.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import { TEST_PNG, TEST_PNG_2 } from "../helpers/test-data";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";

const FORM_ID = "homeschooling-application-2024";

test.describe("Homeschooling Application — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    // BLOCKED: see file header. `acknowledge_requirements` is a required
    // checkbox served with empty options (no checkable input), and the required
    // uploads need a .pdf/.doc fixture. Remove once both are resolved.
    test.fixme(
      true,
      "acknowledge_requirements is a required checkbox served with empty options (unsatisfiable), and uploads need a .pdf/.doc fixture.",
    );

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Applicant Information ───────────────────────────────────────────────
    let step = expectStep(page, "applicant-info");
    await expect(page.locator("h1")).toContainText("Applicant Information");
    await fillField(page, step, "applicant_name", faker.person.fullName());
    await fillField(
      page,
      step,
      "applicant_address",
      faker.location.streetAddress(),
    );
    await fillField(page, step, "contact_numbers", faker.string.numeric(10));
    await fillField(page, step, "email_address", "testing@govtech.bb");
    await selectRadio(page, step, "resident_status", "resident");
    await advance(page, step);

    // ─── Student Information (repeatable) ────────────────────────────────────
    step = expectStep(page, "student-info");
    await fillField(page, step, "student_name", faker.person.fullName());
    await fillField(page, step, "student_dob", "2015-03-12");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Previous Schooling (answer "No" to keep the conditional hidden) ─────
    step = expectStep(page, "previous-schooling");
    await selectRadio(page, step, "previously_in_school", "no");
    await advance(page, step);

    // ─── Instructor/Tutor Information (repeatable) ───────────────────────────
    step = expectStep(page, "instructor-info");
    await fillField(page, step, "instructor_name", faker.person.fullName());
    await fillField(
      page,
      step,
      "instructor_qualifications",
      "B.Ed. Primary Education",
    );
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    // ─── Curriculum and Attachments ──────────────────────────────────────────
    // TODO: these uploads accept .pdf/.doc only — swap TEST_PNG for a document
    // fixture once one exists (see file header).
    step = expectStep(page, "curriculum-attachments");
    await uploadOne(page, step, "timetable_attachment", TEST_PNG);
    // "Yes" keeps the conditional `curriculum_attachment` upload hidden.
    await selectRadio(page, step, "following_national_curriculum", "yes");
    await uploadOne(page, step, "tutor_qualifications_attachment", TEST_PNG_2);
    await advance(page, step);

    // ─── Declaration and Signature ───────────────────────────────────────────
    step = expectStep(page, "declaration-and-signature", { exact: true });
    // BLOCKER: acknowledge_requirements renders no checkable input (empty
    // options). Once the recipe gives it a single option, check it here, e.g.:
    //   await page.locator(`input[id="${step}_acknowledge_requirements-confirmed"]`).check();
    await fillField(page, step, "parent_signature", faker.person.fullName());
    await fillDate(page, step, "signature_date", 2, 6, 2026);
    await advance(page, step);

    // ─── Check your answers (auto-injected by the renderer, if present) ──────
    if (currentStep(page).includes("check-your-answers")) {
      await advance(page, "check-your-answers");
    }

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration", { exact: true });

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, { heading: "Submission Confirmation" });
  });
});
