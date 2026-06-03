/**
 * referral-student-support-services.smoke.spec.ts
 *
 * Live, on-demand smoke test for the "Referral to Student Support Services Unit"
 * form (formId `referral-student-support-services`, version 1.1.0).
 *
 * Drives the REAL deployed form (default: sandbox), fills every REQUIRED field
 * with valid data, SUBMITS FOR REAL, and asserts the confirmation screen. This
 * form has NO email processor (the recipe defines no processors), so a green run
 * persists a submission but sends no email — the lowest-side-effect of the smoke
 * set.
 *
 * Like the other smoke specs this lives under e2e/smoke and runs only via
 * playwright.smoke.config.ts. Shared helpers live in ../helpers/smoke.
 *
 *   pnpm --filter @govtech-bb/forms test:smoke
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb pnpm --filter @govtech-bb/forms test:smoke
 *
 * ⚠️ test.fixme — BLOCKED by a recipe bug on the deployed form. The
 * `additional-difficulties-challenges` and `involvement-with-outside-agencies`
 * steps (and `referral-details.parent_consulted`) contain `checkbox` fields the
 * served contract marks `required: true` but with EMPTY `options: []`. The
 * field-renderer draws one checkbox per option, so an options-less checkbox
 * renders NO checkable input — yet validation requires a value, making those
 * steps impossible to complete through the UI. The form cannot be submitted
 * until the recipe is fixed (make those checkboxes optional, or give them
 * options). This spec drives the rest of the form correctly and is ready to
 * enable (remove the `test.fixme`) once that recipe is fixed and deployed.
 * Tracked in the session summary 2026-06-03-add-form-smoke-tests.md.
 *
 * Notes (confirmed against the deployed sandbox renderer):
 *  - Field IDs are `${stepId}_${fieldId}`. Date fields (`type: date`) render as
 *    plain text inputs accepting an ISO `YYYY-MM-DD` string; `number` fields are
 *    plain fillable inputs.
 *  - RECIPE-VS-DEPLOYED DRIFT: this recipe declares field requiredness via a
 *    top-level `required` flag the deployed validator ignores, so it defaults
 *    text/select/radio fields to REQUIRED even where the recipe says
 *    `"required": false` (e.g. every parent/guardian name + phone field). The
 *    spec therefore fills every text/radio field on each step rather than only
 *    the recipe-required ones.
 */
import { faker } from "@faker-js/faker";
import { test, expect } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectRadio,
  submitAndConfirm,
} from "../helpers/smoke";

const FORM_ID = "referral-student-support-services";

test.describe("Referral to Student Support Services — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    // BLOCKED: required checkbox fields are served with empty options and cannot
    // be satisfied through the UI (see file header). Remove once the recipe is
    // fixed and redeployed to the target environment.
    test.fixme(
      true,
      "Required checkbox fields (difficulties / outside-agencies / parent_consulted) are served with empty options — unsatisfiable until the recipe is fixed.",
    );

    await page.goto(`/forms/${FORM_ID}`);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Student Information ─────────────────────────────────────────────────
    let step = expectStep(page, "student-information");
    await expect(page.locator("h1")).toContainText("Student Information");
    await fillField(page, step, "id_number", faker.string.numeric(9));
    await fillField(page, step, "dob", "2010-01-01");
    await fillField(page, step, "age", "14");
    await fillField(page, step, "gender", "Female");
    await fillField(page, step, "surname", faker.person.lastName());
    await fillField(page, step, "first_middle_name", faker.person.firstName());
    await fillField(page, step, "address", "1 Test Street, St. Michael");
    await advance(page, step);

    // ─── Parent/Guardian Information (deployed form requires ALL fields) ─────
    step = expectStep(page, "parent-guardian-information");
    await fillField(page, step, "mother_name", faker.person.fullName());
    await fillField(page, step, "father_name", faker.person.fullName());
    await fillField(page, step, "guardian_name", faker.person.fullName());
    await fillField(
      page,
      step,
      "parent_guardian_address",
      "1 Test Street, St. Michael",
    );
    await fillField(page, step, "mother_phone_home", faker.string.numeric(10));
    await fillField(page, step, "mother_phone_work", faker.string.numeric(10));
    await fillField(page, step, "mother_phone_cell", faker.string.numeric(10));
    await fillField(page, step, "father_phone_home", faker.string.numeric(10));
    await fillField(page, step, "father_phone_work", faker.string.numeric(10));
    await fillField(page, step, "father_phone_cell", faker.string.numeric(10));
    await fillField(
      page,
      step,
      "guardian_phone_home",
      faker.string.numeric(10),
    );
    await fillField(
      page,
      step,
      "guardian_phone_work",
      faker.string.numeric(10),
    );
    await fillField(
      page,
      step,
      "guardian_phone_cell",
      faker.string.numeric(10),
    );
    await fillField(page, step, "child_resides_with", "Mother");
    await advance(page, step);

    // ─── School Information ──────────────────────────────────────────────────
    step = expectStep(page, "school-information");
    await fillField(page, step, "school_name", "Bridgetown Primary School");
    await fillField(page, step, "class_form", "Form 2");
    await fillField(page, step, "school_telephone", faker.string.numeric(10));
    await advance(page, step);

    // ─── Student Challenges ──────────────────────────────────────────────────
    step = expectStep(page, "student-challenges");
    await fillField(
      page,
      step,
      "student_challenges",
      "Difficulty focusing in class and completing assignments on time.",
    );
    await advance(page, step);

    // ─── Additional Difficulties (all optional — skip) ───────────────────────
    step = expectStep(page, "additional-difficulties-challenges");
    await advance(page, step);

    // ─── School Attendance (required radio) ──────────────────────────────────
    step = expectStep(page, "school-attendance");
    await selectRadio(page, step, "school_attendance", "regular");
    await advance(page, step);

    // ─── Involvement with Outside Agencies (all optional — skip) ─────────────
    step = expectStep(page, "involvement-with-outside-agencies");
    await advance(page, step);

    // ─── Intervention Strategies (recipe-optional, but fill defensively) ─────
    step = expectStep(page, "intervention-strategies");
    await fillField(
      page,
      step,
      "intervention_strategies",
      "One-to-one support sessions and a tailored learning plan.",
    );
    await advance(page, step);

    // ─── Referral Details ────────────────────────────────────────────────────
    step = expectStep(page, "referral-details");
    await fillField(page, step, "referral_initiated_by", "Class Teacher");
    await fillField(page, step, "referral_initiated_date", "2026-06-02");
    await fillField(page, step, "principal_signature", "I. M. Principal");
    await fillField(page, step, "principal_signature_date", "2026-06-02");
    await advance(page, step);

    // ─── For Official Use Only (recipe-optional, but fill defensively) ───────
    step = expectStep(page, "for-official-use-only");
    await fillField(page, step, "case_assigned_to", "Support Services Officer");
    await fillField(page, step, "classification", "Learning Support");
    await fillField(page, step, "official_date", "2026-06-02");
    await fillField(page, step, "official_by", "SSU Coordinator");
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
