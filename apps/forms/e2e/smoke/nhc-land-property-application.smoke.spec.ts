/**
 * nhc-land-property-application.smoke.spec.ts
 *
 * Live, on-demand smoke tests for the NHC Application to Purchase Land or
 * Property (formId `nhc-land-property-application`).
 *
 * These drive the REAL deployed form (default: sandbox), fill every step with
 * valid @faker-js/faker data, SUBMIT FOR REAL, and assert the confirmation
 * screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke they run ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029), and no workflow runs them automatically. The
 * recipe is `visibility: preview`, so it must NOT be added to the post-deploy
 * smoke matrix either (#1842) — a non-public form 404s there.
 *
 * Run them on demand (from the repo root):
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts nhc-land-property-application
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment. REQUIRED — playwright.smoke.config.ts throws
 *                    without it, deliberately, so a real submission can never go to an
 *                    unintended environment by default. Use
 *                    https://forms.sandbox.alpha.gov.bb for sandbox.
 *   PREVIEW_TOKEN    forms preview secret — appended as ?preview=<token>. REQUIRED
 *                    while the recipe is visibility:preview, because a non-public
 *                    recipe 404s without a token. Pass it on the command line so
 *                    the secret never lands in the repo.
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *   SMOKE_LOG_DATA   print the generated answers.
 *   SMOKE_HOLD       pause on the confirmation screen (headed runs).
 *
 * Form-specific notes:
 *  - Four independent gates shape the journey, so the two tests below walk the
 *    widest and the narrowest path through them:
 *      · `has-co-applicant` → co-applicant-details, give-us-your-contact-details,
 *        co-applicant-employment (three `stepConditionalOn` steps);
 *      · `has-children` → children-details;
 *      · `currently-renting` → rental-details;
 *      · `is-tenant` → landlord-permission (an upload step);
 *      · `financing-method` in [mortgage, loan] → financing-details.
 *  - The two `documents` uploads are mutually exclusive via `optionalIf`
 *    (#761/#746): on mortgage/loan the mortgage certificate is required and the
 *    bank statement is optional; on full cash it is the other way round. Each
 *    test uploads only the file its branch requires — advancing is the assertion
 *    that the other one really is optional.
 *  - `national-id-number` (applicant and co-applicant) carries the Maskito hard
 *    mask `999999-9999`. `fill()` bypasses the mask, so the ten raw digits are
 *    typed with `pressSequentially` and the YYMMDD-NNNN shape asserted.
 *  - `tamis-number` is unmasked but must be 10–15 digits.
 *  - `household-income` is a repeatable step (min 1, max 5) with no
 *    `sharedFields`, so it renders as the bare `household-income` page carrying
 *    the `addAnother` radio (labelled "Do you have another source of income?").
 *    Both tests answer "no" to stay on the single-source path.
 *  - `title`, `nationality`, `parish` and `country` are native <select>s — use
 *    the option value (slug), not the label.
 *  - `check-your-answers` and `declaration` are explicit steps in the recipe.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
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
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

const FORM_ID = "nhc-land-property-application";

/** Parish <select> option values (slugs) from components/parish. */
const PARISH_VALUES = [
  "christ-church",
  "st-andrew",
  "st-george",
  "st-james",
  "st-john",
  "st-joseph",
  "st-lucy",
  "st-michael",
  "st-peter",
  "st-philip",
  "st-thomas",
] as const;

/** components/title option values. */
const TITLE_VALUES = ["mr", "miss", "ms", "mrs"] as const;

/** The marital-status radio option values defined on this recipe. */
const MARITAL_STATUS_VALUES = [
  "single",
  "married",
  "widowed",
  "divorced",
  "separated",
] as const;

/**
 * Ten raw digits in National ID shape (YYMMDD + 4). Typed digit-by-digit so
 * Maskito inserts the dash and the value matches `^\d{6}-\d{4}$`.
 */
function nationalIdDigits(): string {
  const dob = faker.date.birthdate({ min: 21, max: 70, mode: "age" });
  const yy = String(dob.getFullYear()).slice(-2);
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const dd = String(dob.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}${faker.string.numeric(4)}`;
}

/** A money value matching `^[0-9]+(\.[0-9]{1,2})?$`. */
function money(min: number, max: number): string {
  return `${faker.number.int({ min, max })}.00`;
}

/** One person's worth of answers — reused for the applicant and co-applicant. */
function buildPerson() {
  return {
    title: faker.helpers.arrayElement(TITLE_VALUES),
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    dob: faker.date.birthdate({ min: 21, max: 70, mode: "age" }),
    maritalStatus: faker.helpers.arrayElement(MARITAL_STATUS_VALUES),
    nationalIdDigits: nationalIdDigits(),
    // components/tamis-number: digits only, 10–15 of them.
    tamisNumber: faker.string.numeric(10),
    addressLine1: faker.location.streetAddress(),
    addressLine2: faker.location.secondaryAddress(),
    parish: faker.helpers.arrayElement(PARISH_VALUES),
    // POSTCODE_FORMAT: ^[Bb]{2} ?\d{5}$
    postcode: `BB${faker.string.numeric(5)}`,
    // Fixed, known-assignable Barbados number — the phone rule runs
    // libphonenumber-js `.isValid()`, which rejects a random 246 exchange.
    telephone: "246-418-1234",
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    employer: faker.company.name(),
    occupation: faker.person.jobTitle(),
    periodOfEmployment: `${faker.number.int({ min: 1, max: 20 })} years`,
    salary: money(2000, 9000),
    payPeriod: faker.helpers.arrayElement([
      "weekly",
      "bi-monthly",
      "monthly",
    ] as const),
    employmentStatus: faker.helpers.arrayElement([
      "government",
      "private",
      "self-employed",
    ] as const),
  };
}

/** Build a complete, valid set of answers for either branch. */
function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    applicant: buildPerson(),
    coApplicant: buildPerson(),

    houseType: faker.helpers.arrayElement([
      "timber",
      "wall",
      "timber-wall",
      "steel-frame",
      "empty-lot",
    ] as const),
    preferredHouseType: faker.helpers.arrayElement([
      "2-bedroom",
      "3-bedroom",
    ] as const),
    numberOfAdults: String(faker.number.int({ min: 1, max: 4 })),
    numberOfChildren: String(faker.number.int({ min: 1, max: 4 })),
    childrenAges: "4, 9 and 13",

    incomeSource: `Smoke test — ${faker.person.jobArea()} salary`,
    incomeAmount: money(1500, 8000),
    incomePayPeriod: "monthly",

    monthlyRent: money(600, 2500),
  };
}

type Data = ReturnType<typeof buildData>;
type Person = ReturnType<typeof buildPerson>;

/** Open the form at its first step, carrying the preview token when supplied. */
async function openForm(page: Page): Promise<void> {
  const previewToken = process.env.PREVIEW_TOKEN;
  const landing = previewToken
    ? `/forms/${FORM_ID}?preview=${encodeURIComponent(previewToken)}`
    : `/forms/${FORM_ID}`;
  await page.goto(landing);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/**
 * Fill a Maskito-masked National ID: type the ten raw digits so the mask
 * inserts the dash, then assert the formatted shape actually landed.
 */
async function fillMaskedNationalId(
  page: Page,
  stepId: string,
  suffix: string,
  digits: string,
): Promise<void> {
  const input = page.locator(`input[id="${stepId}_${suffix}"]`);
  await input.pressSequentially(digits);
  await expect(input, "Maskito did not format the National ID").toHaveValue(
    /^\d{6}-\d{4}$/,
  );
}

/** The applicant's own three steps — identical on both branches. */
async function fillApplicantSteps(page: Page, person: Person): Promise<void> {
  let step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Tell us about yourself");
  await selectDropdown(page, step, "title", person.title);
  await fillField(page, step, "first-name", person.firstName);
  await fillField(page, step, "middle-name", person.middleName);
  await fillField(page, step, "last-name", person.lastName);
  await fillDate(
    page,
    step,
    "date-of-birth",
    person.dob.getDate(),
    person.dob.getMonth() + 1,
    person.dob.getFullYear(),
  );
  await selectRadio(page, step, "marital-status", person.maritalStatus);
  await selectDropdown(page, step, "nationality", "barbadian");
  await fillMaskedNationalId(
    page,
    step,
    "national-id-number",
    person.nationalIdDigits,
  );
  await fillField(page, step, "tamis-number", person.tamisNumber);
  await advance(page, step);

  step = expectStep(page, "your-contact-details", { exact: true });
  await expect(page.locator("h1")).toContainText(
    "Give us your contact details",
  );
  await fillField(page, step, "address-line-1", person.addressLine1);
  await fillField(page, step, "address-line-2", person.addressLine2);
  await selectDropdown(page, step, "parish", person.parish);
  await fillField(page, step, "postcode", person.postcode);
  await selectDropdown(page, step, "country", "barbados");
  await fillField(page, step, "telephone", person.telephone);
  // Optional in the recipe, but it is the confirmation email's recipientField
  // (`your-contact-details.email`) — fill it so a real run is verifiable.
  await fillField(page, step, "email", person.email);
  await advance(page, step);

  step = expectStep(page, "applicant-employment");
  await expect(page.locator("h1")).toContainText("Your employment status");
  await fillField(page, step, "employer", person.employer);
  await fillField(page, step, "occupation", person.occupation);
  await fillField(
    page,
    step,
    "period-of-employment",
    person.periodOfEmployment,
  );
  await fillField(page, step, "salary", person.salary);
  await selectRadio(page, step, "pay-period", person.payPeriod);
  await selectRadio(page, step, "employment-status", person.employmentStatus);
  await advance(page, step);
}

/** The three `stepConditionalOn` co-applicant steps (has-co-applicant = yes). */
async function fillCoApplicantSteps(page: Page, person: Person): Promise<void> {
  let step = expectStep(page, "co-applicant-details", { exact: true });
  await expect(page.locator("h1")).toContainText(
    "Tell us about your co-applicant",
  );
  await selectDropdown(page, step, "co-applicant-title", person.title);
  await fillField(page, step, "co-applicant-first-name", person.firstName);
  await fillField(page, step, "co-applicant-middle-name", person.middleName);
  await fillField(page, step, "co-applicant-last-name", person.lastName);
  await fillDate(
    page,
    step,
    "co-applicant-date-of-birth",
    person.dob.getDate(),
    person.dob.getMonth() + 1,
    person.dob.getFullYear(),
  );
  await selectRadio(
    page,
    step,
    "co-applicant-marital-status",
    person.maritalStatus,
  );
  // The co-applicant's nationality field is `co-citizen`, not `co-applicant-…`.
  await selectDropdown(page, step, "co-citizen", "barbadian");
  await fillMaskedNationalId(
    page,
    step,
    "co-applicant-national-id-number",
    person.nationalIdDigits,
  );
  await fillField(page, step, "co-applicant-tamis-number", person.tamisNumber);
  await advance(page, step);

  step = expectStep(page, "give-us-your-contact-details", { exact: true });
  await expect(page.locator("h1")).toContainText(
    "Give us your co-applicant's contact details",
  );
  // Note the missing dash — the recipe's fieldId really is
  // `co-applicantaddress-line-1`.
  await fillField(
    page,
    step,
    "co-applicantaddress-line-1",
    person.addressLine1,
  );
  await fillField(
    page,
    step,
    "co-applicant-address-line-2",
    person.addressLine2,
  );
  await selectDropdown(page, step, "co-applicant-parish", person.parish);
  await fillField(page, step, "co-applicant-postcode", person.postcode);
  await selectDropdown(page, step, "co-applicant-country", "barbados");
  await fillField(page, step, "co-applicant-telephone", person.telephone);
  await fillField(page, step, "co-applicant-email", person.email);
  await advance(page, step);

  step = expectStep(page, "co-applicant-employment", { exact: true });
  await fillField(page, step, "co-applicant-employer", person.employer);
  await fillField(page, step, "co-applicant-occupation", person.occupation);
  await fillField(
    page,
    step,
    "co-applicant-period-of-employment",
    person.periodOfEmployment,
  );
  await fillField(page, step, "co-applicant-salary", person.salary);
  await selectRadio(page, step, "co-applicant-pay-period", person.payPeriod);
  await selectRadio(
    page,
    step,
    "co-applicant-employment-status",
    person.employmentStatus,
  );
  await advance(page, step);
}

/**
 * The repeatable `household-income` step. One source, `addAnother` = no, so the
 * journey stays on the single-instance path.
 */
async function fillHouseholdIncome(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "household-income", { exact: true });
  await expect(page.locator("h1")).toContainText(
    "Tell us your household income",
  );
  await fillField(page, step, "income-source", data.incomeSource);
  await fillField(page, step, "income-amount", data.incomeAmount);
  await selectRadio(page, step, "income-pay-period", data.incomePayPeriod);
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration", { exact: true });
  await page
    .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
}

test.describe("NHC Application to Purchase Land or Property — Live Smoke", () => {
  test("submits the widest branch (co-applicant, children, renting, tenant, mortgage) end-to-end", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillApplicantSteps(page, data.applicant);

    // ─── Co-applicant gate → yes ─────────────────────────────────────────────
    let step = expectStep(page, "co-applicant-question", { exact: true });
    await selectRadio(page, step, "has-co-applicant", "yes");
    await advance(page, step);
    await fillCoApplicantSteps(page, data.coApplicant);

    // ─── What type of house do you need? (children gate → yes) ───────────────
    step = expectStep(page, "application-type", { exact: true });
    await expect(page.locator("h1")).toContainText(
      "What type of house do you need?",
    );
    await selectRadio(page, step, "house-type", data.houseType);
    await selectRadio(
      page,
      step,
      "preferred-house-type",
      data.preferredHouseType,
    );
    await fillField(page, step, "number-of-adults", data.numberOfAdults);
    await selectRadio(page, step, "has-children", "yes");
    await advance(page, step);

    // ─── Children in your household ──────────────────────────────────────────
    step = expectStep(page, "children-details", { exact: true });
    await fillField(page, step, "number-of-children", data.numberOfChildren);
    await fillField(page, step, "children-ages", data.childrenAges);
    await advance(page, step);

    // ─── Household information ───────────────────────────────────────────────
    step = expectStep(page, "household-info", { exact: true });
    await selectRadio(page, step, "persons-with-disabilities", "yes");
    await advance(page, step);

    await fillHouseholdIncome(page, data);

    // ─── Housing situation (renting gate → yes) ──────────────────────────────
    step = expectStep(page, "housing-situation", { exact: true });
    await selectRadio(page, step, "currently-renting", "yes");
    await advance(page, step);

    step = expectStep(page, "rental-details", { exact: true });
    await fillField(page, step, "monthly-rent", data.monthlyRent);
    await advance(page, step);

    // ─── Land ownership (tenant gate → yes) ──────────────────────────────────
    step = expectStep(page, "land-ownership", { exact: true });
    await selectRadio(page, step, "owns-land", "yes");
    await selectRadio(page, step, "is-tenant", "yes");
    await advance(page, step);

    step = expectStep(page, "landlord-permission", { exact: true });
    await uploadOne(page, step, "landlord-permission-letter", {
      name: "landlord-permission-letter.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Financing (mortgage → financing-details is reached) ─────────────────
    step = expectStep(page, "financing", { exact: true });
    await selectRadio(page, step, "financing-method", "mortgage");
    await advance(page, step);

    step = expectStep(page, "financing-details", { exact: true });
    await fillField(
      page,
      step,
      "lending-institution",
      `${faker.company.name()} — Bridgetown branch`,
    );
    await fillField(page, step, "deposit-available", money(5000, 40000));
    await fillField(page, step, "qualifying-amount", money(100000, 400000));
    await advance(page, step);

    // ─── Documents: on mortgage the certificate is required and the bank ─────
    // statement is `optionalIf financing-method != full-cash`. Upload only the
    // certificate — advancing is the assertion that the statement is optional.
    step = expectStep(page, "documents", { exact: true });
    await uploadOne(page, step, "mortgage-certificate", {
      name: "mortgage-certificate.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers", { exact: true });
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The co-applicant branch really made it into the review.
    await expect(
      page.getByText(data.coApplicant.firstName).first(),
    ).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("skips every conditional step and submits the full-cash, sole-applicant branch", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillApplicantSteps(page, data.applicant);

    // ─── Co-applicant gate → no: all three co-applicant steps drop out ───────
    let step = expectStep(page, "co-applicant-question", { exact: true });
    await selectRadio(page, step, "has-co-applicant", "no");
    await advance(page, step);

    const afterGate = currentStep(page);
    for (const skipped of [
      "co-applicant-details",
      "give-us-your-contact-details",
      "co-applicant-employment",
    ]) {
      expect(
        afterGate,
        `answering no to has-co-applicant must skip ${skipped}`,
      ).not.toContain(skipped);
    }

    // ─── What type of house do you need? (children gate → no) ────────────────
    step = expectStep(page, "application-type", { exact: true });
    await selectRadio(page, step, "house-type", data.houseType);
    await selectRadio(
      page,
      step,
      "preferred-house-type",
      data.preferredHouseType,
    );
    await fillField(page, step, "number-of-adults", data.numberOfAdults);
    await selectRadio(page, step, "has-children", "no");
    await advance(page, step);

    expect(
      currentStep(page),
      "answering no to has-children must skip children-details",
    ).not.toContain("children-details");

    // ─── Household information ───────────────────────────────────────────────
    step = expectStep(page, "household-info", { exact: true });
    await selectRadio(page, step, "persons-with-disabilities", "no");
    await advance(page, step);

    await fillHouseholdIncome(page, data);

    // ─── Housing situation (renting gate → no) ───────────────────────────────
    step = expectStep(page, "housing-situation", { exact: true });
    await selectRadio(page, step, "currently-renting", "no");
    await advance(page, step);

    expect(
      currentStep(page),
      "answering no to currently-renting must skip rental-details",
    ).not.toContain("rental-details");

    // ─── Land ownership (tenant gate → no) ───────────────────────────────────
    step = expectStep(page, "land-ownership", { exact: true });
    await selectRadio(page, step, "owns-land", "no");
    await selectRadio(page, step, "is-tenant", "no");
    await advance(page, step);

    expect(
      currentStep(page),
      "answering no to is-tenant must skip landlord-permission",
    ).not.toContain("landlord-permission");

    // ─── Financing (full cash → financing-details drops out) ─────────────────
    step = expectStep(page, "financing", { exact: true });
    await selectRadio(page, step, "financing-method", "full-cash");
    await advance(page, step);

    expect(
      currentStep(page),
      "choosing full-cash must skip financing-details",
    ).not.toContain("financing-details");

    // ─── Documents: full cash flips the optionalIf pair — the bank statement ─
    // is required and the mortgage certificate is optional.
    step = expectStep(page, "documents", { exact: true });
    await uploadOne(page, step, "bank-statement", {
      name: "bank-statement.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers", { exact: true });
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The skipped steps must not appear in the review either.
    await expect(page.getByText("Monthly rent")).toHaveCount(0);
    await expect(page.getByText("Number of children")).toHaveCount(0);
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
