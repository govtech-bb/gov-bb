/**
 * apply-for-food-business-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Apply to Environmental Health for a food
 * business licence service (formId `apply-for-food-business-licence`, programme
 * `FOOD_BUSINESS_LICENCE`).
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
 *     --config playwright.smoke.config.ts apply-for-food-business-licence
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment. REQUIRED — playwright.smoke.config.ts
 *                    throws without it so a real submission can never land in an
 *                    unintended environment by default.
 *   PREVIEW_TOKEN    recipe preview secret — appended as ?preview=<token>.
 *                    REQUIRED while the recipe is visibility:preview, because a
 *                    non-public recipe 404s without one. Pass it on the command
 *                    line so the secret never lands in the repo.
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   SMOKE_HOLD_CYA   pause a headed run on "Check your answers", before submit.
 *   SMOKE_HOLD       pause a headed run on the confirmation screen.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes:
 *  - Four branches interlock, so the two tests are picked to walk both sides of
 *    each of them:
 *      · `completing-for` = "someone-else" reveals `applicant-type` inline; that
 *        answering "individual" in turn reveals the applicant's own contact and
 *        address block. "myself" hides the whole block.
 *      · `relationship-to-business` = "something-else" reveals
 *        `other-relationship`.
 *      · `application-type` = "renewal" reveals `licence-number` AND hides
 *        `business-already-open` on the next step — which transitively hides
 *        both start-date fields, since each is gated on that answer. So the
 *        renewal branch asks for no dates at all.
 *      · `preparation-location` including "at-another-food-business" or
 *        "at-another-location" puts the repeatable `other-preparation-locations`
 *        step into the journey (stepConditionalOn, `in`).
 *  - `your-country` is gated `notEqual st-michael` on `your-parish`, so it is
 *    VISIBLE while parish is still blank and disappears once St. Michael is
 *    picked. Test 1 picks St. Michael (country hidden), test 2 picks another
 *    parish (country shown and required — components/country defaults to
 *    required, the recipe adds no override).
 *  - `your-telephone` carries a `fieldArray` behaviour (min 1, max 4). Row 0
 *    keeps the plain `${stepId}_your-telephone` id — only rows 1+ are
 *    index-suffixed — so one `fillField` is enough and the "Add another
 *    telephone number" button is left alone.
 *  - Telephone fields run libphonenumber-js `.isValid()`, so a random
 *    `246 NNN NNNN` is rejected — the exchange has to be a real assignable one.
 *  - The food business address is an address-lookup (geocoder) field, so it
 *    cannot take a free-text faker address — the geocoder must return a real
 *    Barbados match to populate the hidden coordinates the catchment router
 *    reads (`catchmentRouting.coordinatesField` =
 *    `about-the-food-business.business-location-address-coordinates`). We
 *    faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `business-location-address-coordinates` filled.
 *    `business-location-address-line-2` is one of the geocoder's write targets
 *    and is optional, so whatever the picked suggestion wrote is left alone.
 *  - `other-preparation-locations` is a repeatable step (min 1, max 5) with no
 *    sharedFields, so the base step IS place 1 and carries the injected
 *    `addAnother` radio. One place is enough; test 2 answers "no".
 *  - `staff-list-upload` is the only required upload. `medical-certificates-
 *    upload` is optional and `multiple: true` (two files, added one at a time —
 *    the widget reuses a non-multiple input). `floor-plan-upload` is optional
 *    and single. All three are exercised anyway so a real run proves the whole
 *    upload path, not just the field that blocks.
 *  - NOT covered, and deliberately: `business-already-open` = "no", which swaps
 *    `business-start-date` for `business-expected-start-date`. Both tests are
 *    real submissions, so the suite stays at two; test 1 takes the "yes" path
 *    because `pastOrToday` is the riskier of the two date rules.
 *  - The confirmation step uses generic `nextSteps` copy with no `{polyclinic}`
 *    placeholder, so there is no resolved-catchment name on screen to assert.
 *    Catchment routing still runs (it drives the MDA email), it just isn't
 *    surfaced to the applicant. Don't add a /Polyclinic/ assertion here; it
 *    would fail.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  fillGeocodedAddress,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  tickCheckbox,
  uploadMany,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-food-business-licence";

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the business location is chosen from this pool.
 */
const GEOCODABLE_ADDRESSES = [
  "Jemmotts Lane, Bridgetown",
  "Broad Street, Bridgetown",
  "Speightstown",
  "Holetown",
  "Oistins",
] as const;

/**
 * Parish <select> option values (slugs) from components/parish, minus
 * `st-michael` — picking St. Michael hides `your-country`, which test 2 needs
 * visible. Test 1 asks for St. Michael by name.
 */
const NON_ST_MICHAEL_PARISHES = [
  "christ-church",
  "st-andrew",
  "st-george",
  "st-james",
  "st-john",
  "st-joseph",
  "st-lucy",
  "st-peter",
  "st-philip",
  "st-thomas",
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

function bbMobileNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/** Build a complete, valid set of answers for either branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  const startedOn = faker.date.past({ years: 2 });
  const expectedStart = faker.date.soon({ days: 90 });

  return {
    yourFirstName: faker.person.firstName(),
    yourMiddleName: faker.person.middleName(),
    yourLastName: faker.person.lastName(),
    yourTelephone: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    yourEmail: "testing@govtech.bb",
    yourAddressLine1: faker.location.streetAddress(),
    yourAddressLine2: faker.location.street(),
    yourTown: faker.location.city(),
    yourParish: faker.helpers.arrayElement(NON_ST_MICHAEL_PARISHES),

    otherRelationship: "Family member helping with the application",
    applicantTelephone: bbMobileNumber(),
    applicantEmail: "testing@govtech.bb",
    applicantAddressLine1: faker.location.streetAddress(),
    applicantAddressLine2: faker.location.street(),
    applicantParish: faker.helpers.arrayElement(NON_ST_MICHAEL_PARISHES),
    licenceNumber: `FBL-${faker.string.numeric(5)}`,

    foodBusinessType: "Takeaway",
    // Timestamped so the resulting submission is easy to find in the target env.
    foodBusinessName: `Smoke Test Food Business ${new Date().toISOString()}`,
    vehicleRegistrationNumber: `V-${faker.string.numeric(5)}`,
    startedOn,
    expectedStart,
    businessLocationAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    businessLocationTown: faker.location.city(),

    otherPrepBusinessName: `Smoke Test Prep Kitchen ${faker.string.alpha(4)}`,
    otherPrepAddressLine1: faker.location.streetAddress(),
    otherPrepAddressLine2: faker.location.street(),
    otherPrepTown: faker.location.city(),
    otherPrepParish: faker.helpers.arrayElement(NON_ST_MICHAEL_PARISHES),

    maleStaffCount: String(faker.number.int({ min: 0, max: 10 })),
    femaleStaffCount: String(faker.number.int({ min: 1, max: 20 })),
  };
}

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
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
 * Step 1 — the person filling the form in. `parish` = "st-michael" hides
 * `your-country`; anything else leaves it visible and required.
 */
export async function fillAboutYou(
  page: Page,
  data: ReturnType<typeof buildData>,
  completingFor: "myself" | "someone-else",
  parish: string,
): Promise<void> {
  const step = expectStep(page, "about-you");
  await expect(page.locator("h1")).toContainText("About you");
  await selectRadio(page, step, "completing-for", completingFor);
  await fillField(page, step, "your-first-name", data.yourFirstName);
  await fillField(page, step, "your-middle-name", data.yourMiddleName);
  await fillField(page, step, "your-last-name", data.yourLastName);
  // fieldArray row 0 keeps the unsuffixed id — see the header note.
  await fillField(page, step, "your-telephone", data.yourTelephone);
  await fillField(page, step, "your-email", data.yourEmail);
  await fillField(page, step, "your-address-line-1", data.yourAddressLine1);
  await fillField(page, step, "your-address-line-2", data.yourAddressLine2);
  await fillField(page, step, "your-town", data.yourTown);

  const country = page.locator(`select[id="${step}_your-country"]`);
  await selectDropdown(page, step, "your-parish", parish);
  if (parish === "st-michael") {
    await expect(country).toBeHidden({ timeout: STEP_TIMEOUT });
  } else {
    await expect(country).toBeVisible({ timeout: STEP_TIMEOUT });
    await selectDropdown(page, step, "your-country", "barbados");
  }

  await advance(page, step);
}

/**
 * Step 2 — who the licence is for. `applicant-type` only exists when step 1 said
 * "someone else"; answering "individual" there reveals the applicant's own
 * contact and address block.
 */
export async function fillApplicantDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  opts: {
    relationship: "owner" | "something-else";
    applicantType?: "individual" | "business-or-organisation";
    applicationType: "first-time" | "renewal";
  },
): Promise<void> {
  const step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Applicant details");

  const otherRelationship = page.locator(`[id="${step}_other-relationship"]`);
  await expect(otherRelationship).toBeHidden();
  await selectRadio(page, step, "relationship-to-business", opts.relationship);
  if (opts.relationship === "something-else") {
    await expect(otherRelationship).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherRelationship.fill(data.otherRelationship);
  } else {
    await expect(otherRelationship).toBeHidden();
  }

  // `applicant-type` itself is conditional on step 1's `completing-for`.
  const applicantEmail = page.locator(`[id="${step}_applicant-email"]`);
  if (opts.applicantType) {
    await selectRadio(page, step, "applicant-type", opts.applicantType);
    if (opts.applicantType === "individual") {
      await expect(applicantEmail).toBeVisible({ timeout: STEP_TIMEOUT });
      await fillField(
        page,
        step,
        "applicant-telephone",
        data.applicantTelephone,
      );
      await fillField(page, step, "applicant-email", data.applicantEmail);
      await fillField(
        page,
        step,
        "applicant-address-line-1",
        data.applicantAddressLine1,
      );
      await fillField(
        page,
        step,
        "applicant-address-line-2",
        data.applicantAddressLine2,
      );
      await selectDropdown(
        page,
        step,
        "applicant-parish",
        data.applicantParish,
      );
      await selectDropdown(page, step, "applicant-country", "barbados");
    }
  } else {
    // "Myself" — the whole applicant block stays out of the way.
    await expect(
      page.locator(`input[type=radio][id="${step}_applicant-type-individual"]`),
    ).toBeHidden();
    await expect(applicantEmail).toBeHidden();
  }

  const licenceNumber = page.locator(`[id="${step}_licence-number"]`);
  await expect(licenceNumber).toBeHidden();
  await selectRadio(page, step, "application-type", opts.applicationType);
  if (opts.applicationType === "renewal") {
    await expect(licenceNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceNumber.fill(data.licenceNumber);
  } else {
    await expect(licenceNumber).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 3 — the business itself, including the geocoded address.
 * `business-already-open` is only asked on a first-time application, and both
 * date fields hang off its answer.
 */
export async function fillAboutTheFoodBusiness(
  page: Page,
  data: ReturnType<typeof buildData>,
  opts: {
    premisesType: "fixed-property" | "mobile-van" | "stall-cart";
    alreadyOpen?: "yes" | "no";
  },
): Promise<void> {
  const step = expectStep(page, "about-the-food-business");
  await expect(page.locator("h1")).toContainText("About the food business");
  await fillField(page, step, "food-business-type", data.foodBusinessType);
  await fillField(page, step, "food-business-name", data.foodBusinessName);

  const vehicleRegistration = page.locator(
    `[id="${step}_vehicle-registration-number"]`,
  );
  await expect(vehicleRegistration).toBeHidden();
  await selectRadio(page, step, "premises-type", opts.premisesType);
  if (opts.premisesType === "mobile-van") {
    await expect(vehicleRegistration).toBeVisible({ timeout: STEP_TIMEOUT });
    await vehicleRegistration.fill(data.vehicleRegistrationNumber);
  } else {
    await expect(vehicleRegistration).toBeHidden();
  }

  const alreadyOpenYes = page.locator(
    `input[type=radio][id="${step}_business-already-open-yes"]`,
  );
  if (opts.alreadyOpen) {
    await expect(alreadyOpenYes).toBeVisible({ timeout: STEP_TIMEOUT });
    await selectRadio(page, step, "business-already-open", opts.alreadyOpen);
    if (opts.alreadyOpen === "yes") {
      // `pastOrToday` — a future start date is refused here.
      await fillDate(
        page,
        step,
        "business-start-date",
        data.startedOn.getDate(),
        data.startedOn.getMonth() + 1,
        data.startedOn.getFullYear(),
      );
    } else {
      await fillDate(
        page,
        step,
        "business-expected-start-date",
        data.expectedStart.getDate(),
        data.expectedStart.getMonth() + 1,
        data.expectedStart.getFullYear(),
      );
    }
  } else {
    // A renewal never asks whether the business is open, so neither date field
    // is reachable — the transitive hide described in the header note.
    await expect(alreadyOpenYes).toBeHidden();
    await expect(
      page.locator(`input[id="${step}_business-start-date-day"]`),
    ).toBeHidden();
    await expect(
      page.locator(`input[id="${step}_business-expected-start-date-day"]`),
    ).toBeHidden();
  }

  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "business-location-address-line-1",
      coordinatesFieldId: "business-location-address-coordinates",
    },
    data.businessLocationAddress,
  );
  // `business-location-address-line-2` is optional and is one of the geocoder's
  // write targets — leave whatever the picked suggestion wrote.
  await fillField(
    page,
    step,
    "business-location-town",
    data.businessLocationTown,
  );
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_business-location-parish"]`),
  ).not.toHaveValue("");

  await advance(page, step);
}

/**
 * Step 4 — where food is prepared. Ticking "at another food business" or "at
 * another location" is what puts the repeatable step into the journey.
 */
export async function fillWhereFoodIsPrepared(
  page: Page,
  preparationLocation:
    | "at-food-business"
    | "at-another-food-business"
    | "at-another-location",
): Promise<void> {
  const step = expectStep(page, "where-food-is-prepared");
  await expect(page.locator("h1")).toContainText(
    "Where food and drink is prepared",
  );
  await selectRadio(page, step, "will-prepare-food", "yes");
  await tickCheckbox(page, step, "preparation-location", preparationLocation);
  await advance(page, step);
}

/**
 * Step 5 — the repeatable `other-preparation-locations`. Only in the journey
 * when step 4 named an off-site kitchen. One place, then "no".
 */
export async function fillOtherPreparationLocation(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "other-preparation-locations");
  await expect(page.locator("h1")).toContainText(
    "Where else food and drink is prepared",
  );
  await fillField(
    page,
    step,
    "other-prep-business-name",
    data.otherPrepBusinessName,
  );
  await fillField(
    page,
    step,
    "other-prep-address-line-1",
    data.otherPrepAddressLine1,
  );
  await fillField(
    page,
    step,
    "other-prep-address-line-2",
    data.otherPrepAddressLine2,
  );
  await fillField(page, step, "other-prep-town", data.otherPrepTown);
  await selectDropdown(page, step, "other-prep-parish", data.otherPrepParish);
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);
}

/** Step 6 — staff counts and the staff-list / medical-certificate uploads. */
export async function fillPeopleWorkingAtTheFoodBusiness(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "people-working-at-the-food-business");
  await expect(page.locator("h1")).toContainText(
    "People working at the food business",
  );
  await fillField(page, step, "male-staff-count", data.maleStaffCount);
  await fillField(page, step, "female-staff-count", data.femaleStaffCount);
  await uploadOne(page, step, "staff-list-upload", {
    name: "staff-list.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  // `multiple: true` — the widget reuses one non-multiple input, so files are
  // added one at a time and must have distinct names.
  await uploadMany(page, step, "medical-certificates-upload", [
    {
      name: "medical-cert-1.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    },
    {
      name: "medical-cert-2.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    },
  ]);
  await advance(page, step);
}

/** Step 7 — the optional floor plan. Uploaded anyway to exercise the path. */
export async function fillFloorPlan(page: Page): Promise<void> {
  const step = expectStep(page, "floor-plan");
  await expect(page.locator("h1")).toContainText("Floor plan");
  await uploadOne(page, step, "floor-plan-upload", {
    name: "floor-plan.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Declaration");
  await page
    .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });

  // No {polyclinic} placeholder on this recipe's confirmation step — assert the
  // Environmental Health nextSteps copy instead. See the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
}

test.describe("Apply for a Food Business Licence — Live Smoke", () => {
  test("submits a first-time application for an open, fixed-property business", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // St. Michael hides `your-country`.
    await fillAboutYou(page, data, "myself", "st-michael");
    await fillApplicantDetails(page, data, {
      relationship: "owner",
      applicationType: "first-time",
    });
    await fillAboutTheFoodBusiness(page, data, {
      premisesType: "fixed-property",
      alreadyOpen: "yes",
    });
    // All preparation on site, so `other-preparation-locations` stays out.
    await fillWhereFoodIsPrepared(page, "at-food-business");
    await fillPeopleWorkingAtTheFoodBusiness(page, data);
    await fillFloorPlan(page);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.foodBusinessName).first()).toBeVisible();
    // Neither the renewal reference nor the vehicle registration was asked.
    await expect(page.getByText(data.licenceNumber)).toHaveCount(0);
    await expect(page.getByText(data.vehicleRegistrationNumber)).toHaveCount(0);
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal on someone else's behalf, for a mobile van prepping off-site", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // Any parish but St. Michael leaves `your-country` visible and required.
    await fillAboutYou(page, data, "someone-else", data.yourParish);
    await fillApplicantDetails(page, data, {
      relationship: "something-else",
      applicantType: "individual",
      applicationType: "renewal",
    });
    // A renewal never asks whether the business is open, so no dates.
    await fillAboutTheFoodBusiness(page, data, { premisesType: "mobile-van" });
    await fillWhereFoodIsPrepared(page, "at-another-food-business");
    await fillOtherPreparationLocation(page, data);
    await fillPeopleWorkingAtTheFoodBusiness(page, data);
    await fillFloorPlan(page);

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Every revealed field made it into the review.
    await expect(page.getByText(data.otherRelationship).first()).toBeVisible();
    await expect(page.getByText(data.licenceNumber).first()).toBeVisible();
    await expect(
      page.getByText(data.vehicleRegistrationNumber).first(),
    ).toBeVisible();
    await expect(
      page.getByText(data.otherPrepBusinessName).first(),
    ).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
