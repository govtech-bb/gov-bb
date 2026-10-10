/**
 * apply-for-offensive-waste-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the offensive trade licence service
 * (formId `apply-for-offensive-waste-licence`, titled "Apply to Environmental
 * Health for an offensive trade licence to do work that may cause fumes, smells
 * or waste"). The formId still says "waste": only the wording users see was
 * renamed (#2858), so the id, slug and programme codes did not move.
 *
 * Drives the REAL form, fills every step with valid @faker-js/faker data,
 * SUBMITS FOR REAL, and asserts the confirmation screen is reached with a
 * reference code.
 *
 * Like the other specs under e2e/smoke it runs ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029), and no workflow runs it automatically.
 *
 * Run on demand (from the repo root):
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts apply-for-offensive-waste-licence
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment. REQUIRED — playwright.smoke.config.ts
 *                    throws without it so a real submission can never land in an
 *                    unintended environment by default.
 *   PREVIEW_TOKEN    recipe preview secret — appended as ?preview=<token>.
 *                    REQUIRED: the recipe is `meta.visibility: "preview"`, so it
 *                    404s without one. Pass it on the command line so the secret
 *                    never lands in the repo.
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   SMOKE_HOLD_CYA   pause a headed run on "Check your answers", before submit.
 *   SMOKE_HOLD       pause a headed run on the confirmation screen.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes:
 *  - Authored steps, in order: `application-type`, `renewal-check` and
 *    `current-licence` (renewal only), `applying-for`, `your-details`,
 *    `licence-holder-person` / `licence-holder-business` (one per
 *    `applying-for` answer), `business-activities`, `work-address`,
 *    `building-plans` (new licence) or `changed-building-plans` (renewal with
 *    building changes), then the platform's `check-your-answers` /
 *    `declaration` / `submission-confirmation`.
 *  - The plans are two steps because a step's `stepConditionalOn` rules are
 *    ANDed, so "new licence OR building changed" cannot be one step.
 *  - There is no stop page. A blocking answer — a different licence holder or a
 *    changed work address on a renewal, or no permission to apply for someone
 *    else — is refused on its own step by a `pattern` rule, so the walk stays
 *    put with the stop copy in the error summary. The blocked test asserts all
 *    three without submitting.
 *  - `applying-for` is a select (three options), not a radio.
 *  - `telephone-number` carries a `fieldArray` behaviour. Row 0 keeps the plain
 *    `${stepId}_telephone-number` id, so one `fillField` is enough. It
 *    validates with libphonenumber-js, so the number needs a real Barbados
 *    exchange — a random `246 NNN NNNN` is rejected.
 *  - The work address is the address-lookup (geocoder) field the catchment
 *    routes on (`work-address.business-address-coordinates`), so it is picked
 *    from a pool of known-geocodable locations, never free text. The
 *    applicant's own address is plain text and routes nothing.
 *  - The confirmation's `{polyclinic}` is the catchment resolved from the WORK
 *    address. We assert a real clinic name and that the "your local
 *    polyclinic" fallback is absent, because that fallback means the MDA's
 *    copy of the application went nowhere.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  openSmokeForm,
  advance,
  expectStep,
  fillField,
  fillGeocodedAddress,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  tickCheckbox,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-offensive-waste-licence";

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

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the WORK address is chosen from this pool.
 */
const GEOCODABLE_ADDRESSES = [
  "Jemmotts Lane, Bridgetown",
  "Broad Street, Bridgetown",
  "Speightstown",
  "Holetown",
  "Oistins",
] as const;

/**
 * Valid Barbados mobile exchanges (the `2XX` after `246`). The phone validation
 * rule runs libphonenumber-js `.isValid()` against real assignable ranges, so a
 * random `246 NNN NNNN` is rejected — the exchange must be a real one.
 */
const BB_MOBILE_EXCHANGES = [
  "230",
  "231",
  "240",
  "249",
  "250",
  "260",
  "262",
  "288",
] as const;

/** The twelve scheduled offensive trades on `business-activities`. */
type BusinessActivity =
  | "slaughtering"
  | "blood-offal-boiling"
  | "bone-boiling-crushing"
  | "fellmongering"
  | "gut-scraping"
  | "gut-spinning"
  | "tallow-melting"
  | "tanning"
  | "chemicals-acids"
  | "glue"
  | "manure-manufacturing"
  | "soap-boiling";

type ApplyingFor = "yourself" | "another-person" | "business";

function bbPhoneNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/** Build a complete, valid set of answers for any branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    // The applicant address is plain text — nothing routes on it.
    applicantAddress: faker.location.streetAddress(),
    applicantAddressLine2: faker.location.street(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbPhoneNumber(),

    currentLicenceNumber: `OT/${faker.string.numeric(5)}`,
    buildingChanges:
      "Added a bunded washdown bay and a new grease trap (smoke test)",
    relationship: "Manager",

    holderFirstName: faker.person.firstName(),
    holderLastName: faker.person.lastName(),
    holderAddress: faker.location.streetAddress(),
    holderParish: faker.helpers.arrayElement(PARISH_VALUES),
    // Timestamped so the resulting submission is easy to find in the target env.
    businessName: `Smoke Test Offensive Trade ${new Date().toISOString()}`,

    // The WORK address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    workAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    workAddressLine2: faker.location.street(),
  };
}

type Data = ReturnType<typeof buildData>;

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/** Click Continue and assert the step refused to advance with `message`. */
async function expectBlocked(
  page: Page,
  step: string,
  message: string,
): Promise<void> {
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await expect(page.locator(".govbb-error-summary")).toContainText(message, {
    timeout: STEP_TIMEOUT,
  });
  expectStep(page, step, { exact: true });
}

/** New licence or renewal. Gates the renewal steps and which plans step shows. */
export async function fillApplicationType(
  page: Page,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "application-type");
  await expect(page.locator("h1")).toContainText("About your application");
  await selectRadio(page, step, "application-type", applicationType);
  await advance(page, step);
}

/**
 * Renewal only. Same holder must be "yes" and address changed must be "no" —
 * the other answers are refused (see the blocked test). "yes" to building
 * changes reveals the optional description and, later, `changed-building-plans`.
 */
export async function fillRenewalCheck(
  page: Page,
  data: Data,
  buildingChanges: "yes" | "no",
): Promise<void> {
  const step = expectStep(page, "renewal-check");
  await expect(page.locator("h1")).toContainText(
    "Check if you can renew your licence",
  );
  await selectRadio(page, step, "same-licence-holder", "yes");
  await selectRadio(page, step, "address-changed", "no");

  const description = page.locator(
    `[id="${step}_building-changes-description"]`,
  );
  await expect(description).toBeHidden();
  await selectRadio(page, step, "building-changes", buildingChanges);
  if (buildingChanges === "yes") {
    await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
    await description.fill(data.buildingChanges);
  }
  await advance(page, step);
}

/** Renewal only — the current licence number, on its own step. */
export async function fillCurrentLicence(
  page: Page,
  data: Data,
): Promise<void> {
  const step = expectStep(page, "current-licence");
  await expect(page.locator("h1")).toContainText(
    "What is your current licence number?",
  );
  await fillField(
    page,
    step,
    "current-licence-number",
    data.currentLicenceNumber,
  );
  await advance(page, step);
}

/** Who the licence is for. Permission and relationship only for someone else. */
export async function fillApplyingFor(
  page: Page,
  data: Data,
  applyingFor: ApplyingFor,
): Promise<void> {
  const step = expectStep(page, "applying-for");
  await expect(page.locator("h1")).toContainText("Who are you applying for?");
  const permission = page.locator(`fieldset[id="${step}_has-permission"]`);

  await selectDropdown(page, step, "applying-for", applyingFor);
  if (applyingFor === "yourself") {
    await expect(permission).toBeHidden();
  } else {
    await expect(permission).toBeVisible({ timeout: STEP_TIMEOUT });
    await selectRadio(page, step, "has-permission", "yes");
    await fillField(
      page,
      step,
      "relationship-to-licence-holder",
      data.relationship,
    );
  }
  await advance(page, step);
}

/** The applicant. Component-default ids, except the address lines and phone. */
export async function fillYourDetails(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  // Row 0 of the `fieldArray` keeps the plain id.
  await fillField(page, step, "telephone-number", data.phone);
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "address-line-1", data.applicantAddress);
  await fillField(page, step, "address-line-2", data.applicantAddressLine2);
  await selectDropdown(page, step, "parish", data.applicantParish);
  await advance(page, step);
}

/** Another person: their name, and an address only when it differs from ours. */
export async function fillLicenceHolderPerson(
  page: Page,
  data: Data,
  sameAddress: "yes" | "no",
): Promise<void> {
  const step = expectStep(page, "licence-holder-person");
  await expect(page.locator("h1")).toContainText(
    "Tell us about the person you are applying for",
  );
  await fillField(page, step, "person-first-name", data.holderFirstName);
  await fillField(page, step, "person-last-name", data.holderLastName);
  await fillHolderAddress(page, step, data, "person", sameAddress);
  await advance(page, step);
}

/** A business: its name, and an address only when it differs from ours. */
export async function fillLicenceHolderBusiness(
  page: Page,
  data: Data,
  sameAddress: "yes" | "no",
): Promise<void> {
  const step = expectStep(page, "licence-holder-business");
  await expect(page.locator("h1")).toContainText("Tell us about the business");
  await fillField(page, step, "business-name", data.businessName);
  await fillHolderAddress(page, step, data, "business", sameAddress);
  await advance(page, step);
}

async function fillHolderAddress(
  page: Page,
  step: string,
  data: Data,
  prefix: "person" | "business",
  sameAddress: "yes" | "no",
): Promise<void> {
  const line1 = page.locator(`[id="${step}_${prefix}-address-line-1"]`);
  await selectRadio(page, step, `${prefix}-same-address`, sameAddress);
  if (sameAddress === "yes") {
    await expect(line1).toBeHidden();
    return;
  }
  await expect(line1).toBeVisible({ timeout: STEP_TIMEOUT });
  await line1.fill(data.holderAddress);
  await selectDropdown(page, step, `${prefix}-parish`, data.holderParish);
}

/** The required checkbox group of scheduled offensive trades. */
export async function fillBusinessActivities(
  page: Page,
  activities: readonly BusinessActivity[],
): Promise<void> {
  const step = expectStep(page, "business-activities");
  await expect(page.locator("h1")).toContainText("What does the business do?");
  await expect(page.locator(".govbb-inset-text")).toContainText(
    "contact Environmental Health before you apply",
  );
  for (const activity of activities) {
    await tickCheckbox(page, step, "business-activities", activity);
  }
  await advance(page, step);
}

/**
 * Where the work is done. This is the step the catchment routes on, so the
 * geocoder MUST resolve: the helper asserts the hidden coordinates filled
 * rather than soft-skipping, because an empty one means the submission reaches
 * no polyclinic at all.
 */
export async function fillWorkAddress(page: Page, data: Data): Promise<string> {
  const step = expectStep(page, "work-address");
  await expect(page.locator("h1")).toContainText("Where do you do the work?");

  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "work-address-line-1",
      coordinatesFieldId: "business-address-coordinates",
    },
    data.workAddress,
  );
  // Line 2 is optional and a suggestion does not always carry one (Speightstown
  // resolves with it empty) — overwrite so the submitted record is deterministic.
  await fillField(page, step, "work-address-line-2", data.workAddressLine2);
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_work-address-parish"]`),
  ).not.toHaveValue("");

  await advance(page, step);
  return coordinates;
}

/** Upload the plans on whichever of the two plans steps this branch reached. */
export async function uploadBuildingPlans(
  page: Page,
  stepId: "building-plans" | "changed-building-plans",
): Promise<void> {
  const step = expectStep(page, stepId, { exact: true });
  await expect(page.locator("h1")).toContainText("Upload your building plans");
  await uploadOne(page, step, stepId, {
    name: "building-plans.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await advance(page, step);
}

/** Land on Check your answers, then tick the declaration and submit for real. */
async function checkAndSubmit(
  page: Page,
  visible: string[],
  absent: string[],
): Promise<void> {
  const cya = expectStep(page, "check-your-answers", { exact: true });
  await expect(page.locator("h1")).toContainText("Check your answers");
  for (const text of visible) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  for (const text of absent) {
    await expect(page.getByText(text)).toHaveCount(0);
  }
  if (process.env.SMOKE_HOLD_CYA) await page.pause();
  await advance(page, cya);

  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Your agreement");
  await page
    .locator(`fieldset[id="${step}_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });

  await expect(
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  // `{polyclinic}` is substituted with the catchment resolved from the geocoded
  // work address. The generic "your local polyclinic" fallback means resolution
  // failed, which would also mean the polyclinic never got its copy of the
  // application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
  if (process.env.SMOKE_HOLD) await page.pause();
}

function logData(data: Data): void {
  if (process.env.SMOKE_LOG_DATA)
    console.log("[smoke-data]", JSON.stringify(data, null, 2));
}

test.describe("Offensive Trade Licence — Live Smoke", () => {
  test("submits a new licence for yourself, with building plans", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplicationType(page, "new");
    // "new" skips both renewal steps.
    await fillApplyingFor(page, data, "yourself");
    await fillYourDetails(page, data);
    // "yourself" skips both licence-holder steps.
    await fillBusinessActivities(page, ["tanning", "soap-boiling"]);
    await fillWorkAddress(page, data);
    await uploadBuildingPlans(page, "building-plans");

    await checkAndSubmit(
      page,
      [data.firstName, data.workAddressLine2],
      [data.currentLicenceNumber, data.businessName],
    );
  });

  test("submits a renewal for another person after building changes", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplicationType(page, "renewal");
    await fillRenewalCheck(page, data, "yes");
    await fillCurrentLicence(page, data);
    await fillApplyingFor(page, data, "another-person");
    await fillYourDetails(page, data);
    await fillLicenceHolderPerson(page, data, "no");
    await fillBusinessActivities(page, [
      "slaughtering",
      "blood-offal-boiling",
      "tallow-melting",
    ]);
    await fillWorkAddress(page, data);
    // A changed building on a renewal asks for the plans on their own step.
    await uploadBuildingPlans(page, "changed-building-plans");

    await checkAndSubmit(
      page,
      [
        data.currentLicenceNumber,
        data.buildingChanges,
        data.holderFirstName,
        data.holderAddress,
      ],
      [data.businessName],
    );
  });

  test("submits a renewal for a business with no building changes", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplicationType(page, "renewal");
    await fillRenewalCheck(page, data, "no");
    await fillCurrentLicence(page, data);
    await fillApplyingFor(page, data, "business");
    await fillYourDetails(page, data);
    await fillLicenceHolderBusiness(page, data, "yes");
    await fillBusinessActivities(page, ["glue"]);
    await fillWorkAddress(page, data);
    // No building changes: neither plans step, straight to Check your answers.

    await checkAndSubmit(
      page,
      [data.currentLicenceNumber, data.businessName],
      [data.buildingChanges, data.holderAddress],
    );
  });

  test("blocks a renewal for a new holder or address, and an applicant without permission", async ({
    page,
  }) => {
    const data = buildData();

    await openForm(page);
    await fillApplicationType(page, "renewal");

    const renewal = expectStep(page, "renewal-check");
    await selectRadio(page, renewal, "same-licence-holder", "no");
    await selectRadio(page, renewal, "address-changed", "no");
    await selectRadio(page, renewal, "building-changes", "no");
    await expectBlocked(
      page,
      renewal,
      "You cannot renew this licence if it is now for a different person, business or organisation.",
    );

    await selectRadio(page, renewal, "same-licence-holder", "yes");
    await selectRadio(page, renewal, "address-changed", "yes");
    await expectBlocked(
      page,
      renewal,
      "You cannot renew this licence if the address where you do the work has changed.",
    );

    await selectRadio(page, renewal, "address-changed", "no");
    await advance(page, renewal);
    await fillCurrentLicence(page, data);

    const applying = expectStep(page, "applying-for");
    await selectDropdown(page, applying, "applying-for", "business");
    await selectRadio(page, applying, "has-permission", "no");
    await fillField(
      page,
      applying,
      "relationship-to-licence-holder",
      data.relationship,
    );
    await expectBlocked(
      page,
      applying,
      "You need permission from the person, business or organisation before you can apply.",
    );
  });
});
