/**
 * apply-for-restaurant-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Apply to Environmental Health for a
 * restaurant licence service (formId `apply-for-restaurant-licence`, programme
 * `RESTAURANT_LICENCE`) — the ongoing licence, as opposed to the 30-day
 * `apply-for-temporary-restaurant-permit`.
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
 *     --config playwright.smoke.config.ts apply-for-restaurant-licence
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
 *  - Two STEP gates and five inline reveals, split across the two tests:
 *      · `completing-for` = "someone-else" puts the whole `applicant-details`
 *        step into the journey (stepConditionalOn); "myself" skips it.
 *      · `food-prep-location` including "commercial-kitchen" or
 *        "another-location" puts the repeatable `location-food-drink-prepared`
 *        step into the journey (stepConditionalOn, `in`).
 *      · `relationship-to-restaurant` = "something-else" reveals
 *        `relationship-other`; `property-use` = "something-else" reveals
 *        `property-use-other`; `restaurant-already-open` = "no" reveals
 *        `restaurant-expected-start-date`; the `building-plan-number` show-hide
 *        reveals `tracking-number-instead`.
 *  - `opening-hours` is one weekly field: seven day rows, each "Not open"
 *    until "Add hours for <Day>" adds a set of native time pickers (up to
 *    three sets a day). The pickers are reached by aria-label — "<Day>
 *    opening time" / "<Day> closing time", suffixed ", set N" once a day
 *    holds more than one set. Each row also offers an "Open 24 hours on
 *    <Day>" checkbox (stores the 00:00 - 23:59 full-day sentinel), and a
 *    top toggle collapses Monday-Friday into one shared row. The submitted
 *    value is one string array of "<Day> HH:MM - HH:MM" entries.
 *  - `your-telephone` is likewise a `fieldArray` (min 1, max 4). Row 0 keeps the
 *    plain `${stepId}_your-telephone` id — only rows 1+ are index-suffixed — so
 *    one `fillField` is enough and the "Add another" button is left alone.
 *  - Telephone fields run libphonenumber-js `.isValid()`, so a random
 *    `246 NNN NNNN` is rejected — the exchange has to be a real assignable one.
 *  - The restaurant address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` =
 *    `about-restaurant.restaurant-address-coordinates`). We faker-pick from a
 *    pool of known-geocodable locations, select the first suggestion, then
 *    assert `restaurant-address-coordinates` filled.
 *  - `building-plan-number` is `components/show-hide` — a disclosure toggle with
 *    no validations, not an input. Test 2 opens it, which reveals the required
 *    `tracking-number-instead`; test 1 leaves it collapsed.
 *  - `location-food-drink-prepared` is a repeatable step (min 1, max 5) with no
 *    sharedFields, so the base step IS establishment 1 and carries the injected
 *    `addAnother` radio. One establishment is enough; test 2 answers "no".
 *  - `staff-list-upload` is the only required upload; the optional
 *    `medical-certificates-upload`, `floor-plan-upload` and
 *    `building-plan-upload` are exercised anyway so a real run proves the whole
 *    upload path, not just the field that blocks. Note that unlike the food
 *    business licence recipe, `medical-certificates-upload` here is NOT
 *    `multiple: true` — it takes one file.
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    token, so the resolved-catchment name IS on screen. We assert the
 *    Environmental Health copy rather than the name itself: which polyclinic
 *    resolves depends on the faker-picked address, so pinning a specific one
 *    would flake.
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
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-restaurant-licence";

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the restaurant address is chosen from this pool.
 */
const GEOCODABLE_ADDRESSES = [
  "Jemmotts Lane, Bridgetown",
  "Broad Street, Bridgetown",
  "Speightstown",
  "Holetown",
  "Oistins",
] as const;

/** Day rows of the weekly `opening-hours` field, in render order. */
const WEEKDAY_VALUES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

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

  return {
    yourFirstName: faker.person.firstName(),
    yourMiddleName: faker.person.middleName(),
    yourLastName: faker.person.lastName(),
    yourTelephone: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    yourEmail: "testing@govtech.bb",
    yourAddressLine1: faker.location.streetAddress(),
    yourAddressLine2: faker.location.street(),
    yourParish: faker.helpers.arrayElement(PARISH_VALUES),

    applicantFirstName: faker.person.firstName(),
    applicantMiddleName: faker.person.middleName(),
    applicantLastName: faker.person.lastName(),
    applicantTelephone: bbMobileNumber(),
    applicantEmail: "testing@govtech.bb",
    applicantAddressLine1: faker.location.streetAddress(),
    applicantAddressLine2: faker.location.street(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),

    relationshipOther: "Family member helping with the application",
    // Timestamped so the resulting submission is easy to find in the target env.
    restaurantName: `Smoke Test Restaurant ${new Date().toISOString()}`,
    expectedStart: faker.date.soon({ days: 90 }),
    restaurantAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    propertyUseOther: "Occupied under a family arrangement",

    otherEstablishmentName: `Smoke Test Commercial Kitchen ${faker.string.alpha(4)}`,
    otherEstablishmentAddress1: faker.location.streetAddress(),
    otherEstablishmentAddress2: faker.location.street(),
    otherEstablishmentParish: faker.helpers.arrayElement(PARISH_VALUES),

    maleStaffCount: String(faker.number.int({ min: 0, max: 10 })),
    femaleStaffCount: String(faker.number.int({ min: 1, max: 20 })),
    trackingNumber: `PD-${faker.string.numeric(6)}`,
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
 * Step 1 — the person filling the form in. "someone-else" is what puts the
 * `applicant-details` step into the journey.
 */
export async function fillAboutYou(
  page: Page,
  data: ReturnType<typeof buildData>,
  completingFor: "myself" | "someone-else",
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
  await selectDropdown(page, step, "your-parish", data.yourParish);
  await selectDropdown(page, step, "your-country", "barbados");
  await advance(page, step);
}

/** Step 2 — the applicant. Only in the journey when step 1 said "someone else". */
export async function fillApplicantDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  applicantType: "individual" | "business",
): Promise<void> {
  const step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Applicant details");
  await selectRadio(page, step, "applicant-type", applicantType);
  await fillField(page, step, "applicant-first-name", data.applicantFirstName);
  await fillField(
    page,
    step,
    "applicant-middle-name",
    data.applicantMiddleName,
  );
  await fillField(page, step, "applicant-last-name", data.applicantLastName);
  await fillField(page, step, "applicant-telephone", data.applicantTelephone);
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
  await selectDropdown(page, step, "applicant-parish", data.applicantParish);
  await selectDropdown(page, step, "applicant-country", "barbados");
  await advance(page, step);
}

/** Step 3 — the application itself. "something-else" reveals the free text. */
export async function fillAboutTheApplication(
  page: Page,
  data: ReturnType<typeof buildData>,
  relationship: "owner" | "something-else",
  applicationType: "first-time" | "renewal",
): Promise<void> {
  const step = expectStep(page, "about-applicant");
  await expect(page.locator("h1")).toContainText("About the application");

  const relationshipOther = page.locator(`[id="${step}_relationship-other"]`);
  await expect(relationshipOther).toBeHidden();
  await selectDropdown(page, step, "relationship-to-restaurant", relationship);
  if (relationship === "something-else") {
    await expect(relationshipOther).toBeVisible({ timeout: STEP_TIMEOUT });
    await relationshipOther.fill(data.relationshipOther);
  } else {
    await expect(relationshipOther).toBeHidden();
  }

  await selectRadio(page, step, "application-type", applicationType);
  await advance(page, step);
}

/** Step 4 — the restaurant, including the geocoded address. */
export async function fillAboutTheRestaurant(
  page: Page,
  data: ReturnType<typeof buildData>,
  alreadyOpen: "yes" | "no",
  propertyUse: "owned" | "rented" | "permission" | "something-else",
): Promise<void> {
  const step = expectStep(page, "about-restaurant");
  await expect(page.locator("h1")).toContainText("About the restaurant");
  await fillField(page, step, "restaurant-name", data.restaurantName);

  const expectedStartDay = page.locator(
    `input[id="${step}_restaurant-expected-start-date-day"]`,
  );
  await expect(expectedStartDay).toBeHidden();
  await selectRadio(page, step, "restaurant-already-open", alreadyOpen);
  if (alreadyOpen === "no") {
    await expect(expectedStartDay).toBeVisible({ timeout: STEP_TIMEOUT });
    await fillDate(
      page,
      step,
      "restaurant-expected-start-date",
      data.expectedStart.getDate(),
      data.expectedStart.getMonth() + 1,
      data.expectedStart.getFullYear(),
    );
  } else {
    await expect(expectedStartDay).toBeHidden();
  }

  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "restaurant-address-line-1",
      coordinatesFieldId: "restaurant-address-coordinates",
    },
    data.restaurantAddress,
  );
  // `restaurant-address-line-2` is optional and is one of the geocoder's write
  // targets — leave whatever the picked suggestion wrote.
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_restaurant-parish"]`),
  ).not.toHaveValue("");

  const propertyUseOther = page.locator(`[id="${step}_property-use-other"]`);
  await expect(propertyUseOther).toBeHidden();
  await selectDropdown(page, step, "property-use", propertyUse);
  if (propertyUse === "something-else") {
    await expect(propertyUseOther).toBeVisible({ timeout: STEP_TIMEOUT });
    await propertyUseOther.fill(data.propertyUseOther);
  } else {
    await expect(propertyUseOther).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 5 — opening hours. One weekly field: for each day with hours, click
 * "Add hours for <Day>" and set both pickers; a day left alone stays
 * "Not open". `hoursByDay` values are "HH:MM - HH:MM" strings, one per set,
 * or the literal "24 hours" to tick that day's "Open 24 hours" checkbox.
 * Sets are added one at a time because a day's picker labels gain a
 * ", set N" suffix the moment it holds more than one set.
 */
export async function fillOpeningHours(
  page: Page,
  hoursByDay: Partial<Record<(typeof WEEKDAY_VALUES)[number], string[]>>,
): Promise<void> {
  const step = expectStep(page, "opening-hours");
  await expect(page.locator("h1")).toContainText("Opening hours");

  for (const [day, sets] of Object.entries(hoursByDay)) {
    for (let i = 0; i < sets.length; i++) {
      if (sets[i] === "24 hours") {
        await page
          .getByRole("checkbox", { name: `Open 24 hours on ${day}` })
          .check();
        continue;
      }
      await page.getByRole("button", { name: `Add hours for ${day}` }).click();
      const suffix = sets.length > 1 && i > 0 ? `, set ${i + 1}` : "";
      const [start, end] = sets[i].split(" - ");
      await page.getByLabel(`${day} opening time${suffix}`).fill(start);
      await page.getByLabel(`${day} closing time${suffix}`).fill(end);
    }
  }

  // A day with no hours reads "Not open".
  const closedDays = WEEKDAY_VALUES.filter((d) => !(d in hoursByDay));
  await expect(page.getByText("Not open")).toHaveCount(closedDays.length);

  await advance(page, step);
}

/**
 * Step 6 — where food is prepared. Ticking "commercial-kitchen" or
 * "another-location" is what puts the repeatable step into the journey.
 */
export async function fillFoodPreparation(
  page: Page,
  location:
    | "at-restaurant"
    | "commercial-kitchen"
    | "another-location"
    | "no-prep",
): Promise<void> {
  const step = expectStep(page, "food-preparation");
  await expect(page.locator("h1")).toContainText(
    "Where are food and drink prepared",
  );
  await tickCheckbox(page, step, "food-prep-location", location);
  await advance(page, step);
}

/**
 * Step 7 — the repeatable `location-food-drink-prepared`. Only in the journey
 * when step 6 named an off-site kitchen. One establishment, then "no".
 */
export async function fillOtherEstablishment(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "location-food-drink-prepared");
  await fillField(
    page,
    step,
    "other-establishment-name",
    data.otherEstablishmentName,
  );
  await fillField(
    page,
    step,
    "other-establishment-address-1",
    data.otherEstablishmentAddress1,
  );
  await fillField(
    page,
    step,
    "other-establishment-address-2",
    data.otherEstablishmentAddress2,
  );
  await selectDropdown(
    page,
    step,
    "other-establishment-parish",
    data.otherEstablishmentParish,
  );
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);
}

/** Step 8 — staff counts and the staff-list / medical-certificate uploads. */
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
  // Single-file here, unlike the food business licence recipe.
  await uploadOne(page, step, "medical-certificates-upload", {
    name: "medical-certs.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await advance(page, step);
}

/**
 * Step 9 — plans. Everything here is optional, but opening the
 * `building-plan-number` disclosure reveals a REQUIRED tracking number, so the
 * two tests take opposite sides of it.
 */
export async function fillFloorPlan(
  page: Page,
  data: ReturnType<typeof buildData>,
  useTrackingNumber: boolean,
): Promise<void> {
  const step = expectStep(page, "floor-plan");
  await expect(page.locator("h1")).toContainText("Upload floor plan");
  await uploadOne(page, step, "floor-plan-upload", {
    name: "floor-plan.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });

  const trackingNumber = page.locator(`[id="${step}_tracking-number-instead"]`);
  await expect(trackingNumber).toBeHidden();
  if (useTrackingNumber) {
    // `components/show-hide` renders as a native <details>/<summary>; clicking
    // the summary commits `true` through TanStack-Form, which is what the
    // conditional on `tracking-number-instead` reads.
    await page
      .locator("details.govbb-show-hide summary", {
        hasText: "Use tracking number instead",
      })
      .click();
    await expect(trackingNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await trackingNumber.fill(data.trackingNumber);
  } else {
    await uploadOne(page, step, "building-plan-upload", {
      name: "building-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await expect(trackingNumber).toBeHidden();
  }

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

  // The confirmation markdown names the resolved polyclinic's Environmental
  // Health Department — assert that copy, not a specific polyclinic name. See
  // the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
}

test.describe("Apply for a Restaurant Licence — Live Smoke", () => {
  test("submits a first-time application for an open, owner-occupied restaurant", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // "Myself" keeps `applicant-details` out of the journey.
    await fillAboutYou(page, data, "myself");
    await fillAboutTheApplication(page, data, "owner", "first-time");
    await fillAboutTheRestaurant(page, data, "yes", "owned");
    await fillOpeningHours(page, {
      Monday: ["09:00 - 17:00"],
      Tuesday: ["09:00 - 17:00"],
      Wednesday: ["09:00 - 17:00"],
      Thursday: ["09:00 - 17:00"],
      Friday: ["09:00 - 17:00"],
    });
    // All preparation on site, so `location-food-drink-prepared` stays out.
    await fillFoodPreparation(page, "at-restaurant");
    await fillPeopleWorkingAtTheFoodBusiness(page, data);
    await fillFloorPlan(page, data, false);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.restaurantName).first()).toBeVisible();
    await expect(page.getByText("09:00 - 17:00").first()).toBeVisible();
    // None of the "something else" free texts were asked on this branch.
    await expect(page.getByText(data.relationshipOther)).toHaveCount(0);
    await expect(page.getByText(data.propertyUseOther)).toHaveCount(0);
    await expect(page.getByText(data.trackingNumber)).toHaveCount(0);
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal on someone else's behalf, with per-day hours and an off-site kitchen", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutYou(page, data, "someone-else");
    await fillApplicantDetails(page, data, "individual");
    await fillAboutTheApplication(page, data, "something-else", "renewal");
    await fillAboutTheRestaurant(page, data, "no", "something-else");
    await fillOpeningHours(page, {
      Monday: ["07:30 - 15:00"],
      Saturday: ["10:00 - 14:00", "18:00 - 22:00"],
    });
    await fillFoodPreparation(page, "commercial-kitchen");
    await fillOtherEstablishment(page, data);
    await fillPeopleWorkingAtTheFoodBusiness(page, data);
    await fillFloorPlan(page, data, true);

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The gated step and every inline reveal made it into the review.
    await expect(page.getByText(data.applicantLastName).first()).toBeVisible();
    await expect(page.getByText(data.relationshipOther).first()).toBeVisible();
    await expect(page.getByText(data.propertyUseOther).first()).toBeVisible();
    await expect(
      page.getByText(data.otherEstablishmentName).first(),
    ).toBeVisible();
    await expect(page.getByText(data.trackingNumber).first()).toBeVisible();
    await expect(page.getByText("07:30 - 15:00").first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
