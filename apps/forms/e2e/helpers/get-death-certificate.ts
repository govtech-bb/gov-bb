/**
 * Walks the "Get a Death Certificate" form (`get-death-certificate`) up to and
 * including ticking the declaration, leaving the Submit button to the caller.
 *
 * Shared by the live smoke spec and Journey 5 (EZ Pay payment, #3012), which
 * submits the same form for real and goes on to pay. Field notes for the
 * recipe live in e2e/smoke/get-death-certificate.smoke.spec.ts.
 */
import { faker } from "@faker-js/faker";
import type { Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  openSmokeForm,
  selectDropdown,
  selectRadio,
} from "./smoke";

export const DEATH_CERTIFICATE_FORM_ID = "get-death-certificate";

export async function fillDeathCertificate(
  page: Page,
  { email }: { email: string },
): Promise<void> {
  await openSmokeForm(page, DEATH_CERTIFICATE_FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });

  // ─── Tell us about yourself ──────────────────────────────────────────────
  let step = expectStep(page, "applicant-details", { exact: true });
  await selectDropdown(page, step, "applicant-title", "mr");
  await fillField(page, step, "applicant-first-name", faker.person.firstName());
  await fillField(page, step, "applicant-last-name", faker.person.lastName());
  await fillField(
    page,
    step,
    "applicant-address-line-1",
    faker.location.streetAddress(),
  );
  await selectDropdown(page, step, "applicant-parish", "st-michael");
  // Masked National ID (999999-9999) — supply the `850101-0001` shape; a bare
  // numeric string fails the mask's `^\d{6}-\d{4}$` pattern.
  await fillField(page, step, "applicant-id-number", "850101-0001");
  await fillField(page, step, "applicant-email", email);
  await fillField(page, step, "applicant-telephone", "246-418-1234");
  // passport-toggle left OFF → applicant-passport-number stays hidden.
  await advance(page, step);

  // ─── Your relationship with the deceased ("spouse" hides the conditional) ─
  // The relationship <select>'s fieldId is the component default `relationship`
  // (the recipe sets no fieldId override), NOT `relationship-to-person`.
  step = expectStep(page, "relationship-to-person", { exact: true });
  await selectDropdown(page, step, "relationship", "spouse");
  await advance(page, step);

  // ─── Why you need this certificate (reason, min 10 chars) ────────────────
  step = expectStep(page, "reason-for-certificate", { exact: true });
  // `reason-for-certificate` uses the `components/name` validator (letters,
  // spaces, hyphens and apostrophes only) — no periods, commas or digits.
  await fillField(
    page,
    step,
    "reason-for-certificate",
    "To settle the deceased estate and close outstanding accounts",
  );
  await advance(page, step);

  // ─── Tell us about the deceased (known date of death → date widget) ──────
  step = expectStep(page, "deceased-details", { exact: true });
  await fillField(page, step, "deceased-first-name", faker.person.firstName());
  await fillField(page, step, "deceased-last-name", faker.person.lastName());
  await selectRadio(page, step, "deceased-known-date-of-death", "yes");
  await fillDate(page, step, "deceased-date-of-death", 3, 4, 2020);
  // `deceased-place-of-death` also uses the `components/name` validator — no
  // commas/periods.
  await fillField(
    page,
    step,
    "deceased-place-of-death",
    "Bridgetown Saint Michael",
  );
  await advance(page, step);

  // ─── How many copies do you need? ────────────────────────────────────────
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
    .locator(`fieldset[id="declaration_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();
}
