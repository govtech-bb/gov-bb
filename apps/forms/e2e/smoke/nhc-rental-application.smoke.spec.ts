/**
 * nhc-rental-application.smoke.spec.ts
 *
 * Live, on-demand smoke test for the NHC rental home or house lot application
 * (formId `nhc-rental-application`).
 *
 * Drives the REAL form, fills every step it reaches, SUBMITS FOR REAL, and
 * asserts the confirmation screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke it runs ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029), and no workflow runs it automatically.
 *
 * Run on demand (from the repo root):
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts nhc-rental-application
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment. REQUIRED.
 *   PREVIEW_TOKEN    recipe preview secret — REQUIRED while the recipe is
 *                    visibility:preview. The API must also list the form in
 *                    PREVIEW_SUBMISSION_FORM_IDS, or the submit is refused.
 *   SMOKE_SLOWMO / SMOKE_HOLD_CYA / SMOKE_HOLD / FAKER_SEED — as elsewhere.
 *
 * Form-specific notes (#2913):
 *  - `application-type` (rental home / house lot) and `applying-with` (on my
 *    own / with another person) drive the routing. The second-person steps
 *    (`co-applicant-details`, `co-applicant-contact`, `co-applicant-work`)
 *    show only for a joint application; `household` and `other-occupants`
 *    only for a rental home; a retired person never sees their work step.
 *  - There is no stop page. "No" to a citizen question or the combined
 *    income question is refused on its own step by a `^yes$` pattern, and an
 *    amount over BDS $3,000 a month is refused by a `max` rule that scales
 *    the amount by its frequency (`scaleBy`: weekly x4, twice a month x2,
 *    monthly x1). The first walk checks the cap live: BDS $800 a week
 *    (= $3,200 a month) is refused, BDS $700 a week passes.
 *  - Money fields are `components/money-bds`: a text input with a "BDS $"
 *    prefix, so they are filled like text.
 *  - `national-id-number` has a hard mask, so its digits are typed, not filled.
 *  - `co-applicant-same-address` "Yes" hides the second person's address;
 *    the second walk asserts the address stays hidden.
 *  - The confirmation copy names "rental home" or "house lot" from the first
 *    answer (`conditionalMarkdown` token `{applicationType}`).
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  openSmokeForm,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "nhc-rental-application";

/** Real Barbados mobile exchanges — the phone rule rejects made-up ones. */
const BB_MOBILE_EXCHANGES = ["230", "231", "240", "249", "250", "260"] as const;

function bbMobileNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

type Person = {
  firstName: string;
  lastName: string;
  nationalIdDigits: string;
  mobile: string;
};

function buildPerson(): Person {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    nationalIdDigits: `850101${faker.string.numeric(4)}`,
    mobile: bbMobileNumber(),
  };
}

export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));
  return {
    applicant: buildPerson(),
    coApplicant: buildPerson(),
    // Goes to the monitored test inbox so a real run is verifiable end to end.
    email: "testing@govtech.bb",
    address: faker.location.streetAddress(),
    occupantName: `${faker.person.firstName()} ${faker.person.lastName()}`,
  };
}

type Data = ReturnType<typeof buildData>;

function png(name: string) {
  return { name, mimeType: TEST_PNG.mimeType, buffer: TEST_PNG.buffer };
}

async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

async function chooseRoute(
  page: Page,
  type: "rental-home" | "house-lot",
  applyingWith: "on-my-own" | "with-another-person",
): Promise<void> {
  let step = expectStep(page, "application-type");
  await selectRadio(page, step, "application-type", type);
  await advance(page, step);

  step = expectStep(page, "applying-with");
  await selectRadio(page, step, "applying-with", applyingWith);
  await advance(page, step);

  step = expectStep(page, "eligibility");
  await selectRadio(page, step, "citizen", "yes");
  if (applyingWith === "with-another-person") {
    await selectRadio(page, step, "co-applicant-citizen", "yes");
  }
  await advance(page, step);
}

async function typeNationalId(
  page: Page,
  step: string,
  fieldId: string,
  digits: string,
): Promise<void> {
  const input = page.locator(`input[id="${step}_${fieldId}"]`);
  await input.pressSequentially(digits);
  await expect(input).toHaveValue(`${digits.slice(0, 6)}-${digits.slice(6)}`);
}

async function fillPersonDetails(
  page: Page,
  stepId: string,
  prefix: "" | "co-applicant-",
  person: Person,
  maritalStatus: string,
): Promise<void> {
  const step = expectStep(page, stepId);
  if (prefix) {
    await selectDropdown(page, step, `${prefix}relationship`, "spouse");
  }
  await selectDropdown(page, step, `${prefix}title`, "mr");
  await fillField(page, step, `${prefix}first-name`, person.firstName);
  await fillField(page, step, `${prefix}last-name`, person.lastName);
  await fillDate(page, step, `${prefix}date-of-birth`, 30, 12, 1986);
  await typeNationalId(
    page,
    step,
    `${prefix}national-id-number`,
    person.nationalIdDigits,
  );
  await selectRadio(page, step, `${prefix}marital-status`, maritalStatus);
  await selectDropdown(page, step, `${prefix}country-of-residence`, "barbados");
  await advance(page, step);
}

async function fillApplicantContact(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "applicant-contact");
  await fillField(page, step, "address-line-1", data.address);
  await selectDropdown(page, step, "parish", "st-michael");
  await fillField(page, step, "mobile-telephone", data.applicant.mobile);
  await fillField(page, step, "email", data.email);
  await advance(page, step);
}

async function fillHousingAndDebts(
  page: Page,
  joint: boolean,
  ownsLabel: string,
): Promise<void> {
  let step = expectStep(page, "housing");
  await expect(
    page.locator(`fieldset[id="${step}_owns-property"] legend`),
  ).toContainText(ownsLabel);
  await selectRadio(page, step, "owns-property", "no");
  await selectRadio(page, step, "previous-nhc-rental", "no");
  if (joint) {
    await selectRadio(page, step, "co-applicant-owns-property", "no");
    await selectRadio(page, step, "co-applicant-previous-nhc-rental", "no");
  }
  await advance(page, step);

  // Every money-owed question is optional.
  step = expectStep(page, "money-owed");
  await advance(page, step);
}

async function agreeAndSubmit(page: Page, name: string): Promise<void> {
  let step = expectStep(page, "check-your-answers");
  await expect(page.locator("h1")).toContainText("Check your answers");
  if (process.env.SMOKE_HOLD_CYA) await page.pause();
  await advance(page, step);

  step = expectStep(page, "declaration");
  await page
    .locator(`fieldset[id="${step}_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();
  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
  await expect(
    page.getByText(`Your application for an NHC ${name} has been submitted.`),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  await expect(page.getByText("Telephone: (246) 536-5300")).toBeVisible();
  if (process.env.SMOKE_HOLD) await page.pause();
}

test.describe("NHC rental application — Live Smoke", () => {
  test("submits a single applicant's application for a rental home", async ({
    page,
  }) => {
    const data = buildData();
    await openForm(page);
    await chooseRoute(page, "rental-home", "on-my-own");

    // Income: the weekly amount is scaled to a month before the cap.
    let step = expectStep(page, "income");
    await expect(
      page.locator(`[id="${step}_co-applicant-income-type"]`),
    ).toHaveCount(0);
    await selectRadio(page, step, "income-type", "government-employee");
    await expect(page.getByText("How much are you paid?")).toBeVisible();
    await selectRadio(page, step, "income-frequency", "weekly");
    await fillField(page, step, "income-amount", "800");
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(
      page
        .getByText("The amount you receive is more than BDS $3,000 a month")
        .first(),
    ).toBeVisible({ timeout: STEP_TIMEOUT });
    expectStep(page, "income", { exact: true });
    await fillField(page, step, "income-amount", "700");
    await advance(page, step);

    await fillPersonDetails(
      page,
      "applicant-details",
      "",
      data.applicant,
      "single",
    );
    await fillApplicantContact(page, data);

    step = expectStep(page, "applicant-work");
    await fillField(page, step, "employer-name", "Ministry of Housing");
    await fillField(page, step, "job-title", "Clerk");
    await fillField(page, step, "employment-length", "4 years");
    await advance(page, step);

    await fillHousingAndDebts(page, false, "Do you own any land or property?");

    step = expectStep(page, "household");
    await expect(page.getByText("We already have your details.")).toBeVisible();
    await selectRadio(page, step, "anyone-else", "yes");
    await advance(page, step);

    step = expectStep(page, "other-occupants");
    await fillField(page, step, "occupant-name", data.occupantName);
    await selectDropdown(page, step, "occupant-relationship", "child");
    await fillField(page, step, "occupant-age", "9");
    await selectRadio(page, step, "addAnother", "no");
    await advance(page, step);

    step = expectStep(page, "upload-your-documents");
    await expect(
      page.locator(`input[type=file][id="${step}_pension-document"]`),
    ).toHaveCount(0);
    await uploadOne(page, step, "national-id-card", png("id-card.png"));
    await uploadOne(page, step, "passport-photo", png("photo.png"));
    await uploadOne(page, step, "payslips", png("payslip.png"));
    await uploadOne(page, step, "job-letter", png("job-letter.png"));
    await advance(page, step);

    await agreeAndSubmit(page, "rental home");
  });

  test("submits a joint application for a house lot", async ({ page }) => {
    const data = buildData();
    await openForm(page);
    await chooseRoute(page, "house-lot", "with-another-person");

    let step = expectStep(page, "income");
    await selectRadio(page, step, "income-type", "self-employed");
    await fillField(page, step, "income-amount", "1500");
    await selectRadio(page, step, "income-frequency", "monthly");
    await selectRadio(page, step, "co-applicant-income-type", "retired");
    await fillField(page, step, "co-applicant-income-amount", "600.50");
    await selectRadio(
      page,
      step,
      "co-applicant-income-frequency",
      "twice-a-month",
    );
    await selectRadio(page, step, "combined-income-eligible", "yes");
    await advance(page, step);

    await fillPersonDetails(
      page,
      "applicant-details",
      "",
      data.applicant,
      "married",
    );
    await fillApplicantContact(page, data);

    step = expectStep(page, "applicant-work");
    await fillField(page, step, "self-employed-work", "Carpentry");
    await fillField(page, step, "self-employment-length", "10 years");
    await advance(page, step);

    await fillPersonDetails(
      page,
      "co-applicant-details",
      "co-applicant-",
      data.coApplicant,
      "married",
    );

    step = expectStep(page, "co-applicant-contact");
    await selectRadio(page, step, "co-applicant-same-address", "yes");
    await expect(
      page.locator(`[id="${step}_co-applicant-address-line-1"]`),
    ).toHaveCount(0);
    await fillField(
      page,
      step,
      "co-applicant-mobile-telephone",
      data.coApplicant.mobile,
    );
    await fillField(page, step, "co-applicant-email", data.email);
    await advance(page, step);

    // The retired second applicant has no work step, and a house lot has no
    // household steps, so the next stop is housing.
    await fillHousingAndDebts(page, true, "Do you own any land or property?");

    step = expectStep(page, "upload-your-documents");
    await uploadOne(page, step, "national-id-card", png("id-card.png"));
    await uploadOne(page, step, "passport-photo", png("photo.png"));
    // Proof of income is optional for a self-employed applicant: skip it.
    await uploadOne(
      page,
      step,
      "co-applicant-national-id-card",
      png("co-id-card.png"),
    );
    await uploadOne(
      page,
      step,
      "co-applicant-passport-photo",
      png("co-photo.png"),
    );
    await uploadOne(
      page,
      step,
      "co-applicant-pension-document",
      png("pension.png"),
    );
    await advance(page, step);

    await agreeAndSubmit(page, "house lot");
  });
});
