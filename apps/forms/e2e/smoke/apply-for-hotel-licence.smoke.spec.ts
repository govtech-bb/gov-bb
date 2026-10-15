/**
 * apply-for-hotel-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Hotel Licence Application service
 * (formId `apply-for-hotel-licence`).
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
 *     --config playwright.smoke.config.ts apply-for-hotel-licence
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
 * Form-specific notes (recipe as of the #2813 content review):
 *  - `application-type` = "renew-licence" reveals the inline
 *    `hotel-licence-number` field. The `planning-and-site-plan` step is
 *    new-licence only (stepConditionalOn), so a renewal goes straight from
 *    `amenities` to `check-your-answers`.
 *  - On `planning-and-site-plan`, `planning-applied` = "yes" reveals the
 *    application number inline under the radio; "no" opens the separate
 *    `upload-site-plan` step (stepConditionalOn), which asks for the upload.
 *  - `applying-for` = "someone-else" reveals `has-permission` (must be "yes" —
 *    a `^yes$` pattern) and the `applicant-hotel-relationship` select.
 *  - `hotel-operator-type` picks the next step: "i-do" skips both operator
 *    steps, "another-person" opens `hotel-operator-details` (and reveals
 *    `operator-hotel-relationship` inline), "business" opens
 *    `hotel-operator-business`.
 *  - The hotel address is an address-lookup (geocoder) field, so it cannot take
 *    a free-text faker address — the geocoder must return a real Barbados match
 *    to populate the hidden coordinates the catchment router reads. We
 *    faker-pick from a pool of known-geocodable locations.
 *  - `hotel-address-line-2` is optional (#2791) and the geocoder writes it, so
 *    the blank walk CLEARS it after the pick rather than assume the suggestion
 *    carried nothing.
 *  - `floor-details` is a repeatable step (min 1, max 10) with no sharedFields,
 *    so the base step IS floor 1 and carries the injected `addAnother` radio;
 *    floor 2 lands on `floor-details~1`. The renewal test adds a second floor.
 *  - `amenities` is optional; each ticked amenity reveals a "have you applied
 *    for its licence?" radio (fieldConditionalOn `operator: "in"`).
 *  - There is no National Registration Number on this form, so no Maskito-masked
 *    field to type digit-by-digit.
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
  mockGeocoder,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-hotel-licence";

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
 * a suggestion is picked — so the hotel address is chosen from this pool.
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

function bbMobileNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/**
 * One floor's worth of answers. The counts are internally coherent (rooms-with-X
 * never exceeds the room count) even though the recipe imposes no cross-field
 * rule — a nonsense floor in a real submission is noise for whoever reads it.
 */
function buildFloor(name: string) {
  const rooms = faker.number.int({ min: 2, max: 30 });
  const withFacility = () => String(faker.number.int({ min: 0, max: rooms }));

  return {
    name,
    rooms: String(rooms),
    occupants: String(faker.number.int({ min: 0, max: rooms * 2 })),
    waterClosets: String(faker.number.int({ min: 1, max: rooms })),
    roomsWithWaterClosets: withFacility(),
    baths: String(faker.number.int({ min: 1, max: rooms })),
    roomsWithBaths: withFacility(),
    basins: String(faker.number.int({ min: 1, max: rooms })),
    roomsWithBasins: withFacility(),
  };
}

/** Build a complete, valid set of answers for any branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    addressLine1: faker.location.streetAddress(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    mobile: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    applicantEmail: "testing@govtech.bb",

    // Timestamped so the resulting submission is easy to find in the target env.
    hotelName: `Smoke Test Hotel ${new Date().toISOString()}`,
    hotelAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    hotelAddressLine2: faker.location.street(),

    licenceNumber: `HTL-${faker.string.numeric(5)}`,
    planningApplicationNumber: `TCP-${faker.string.numeric(6)}`,

    operatorFirstName: faker.person.firstName(),
    operatorLastName: faker.person.lastName(),
    operatorAddressLine1: faker.location.streetAddress(),
    operatorParish: faker.helpers.arrayElement(PARISH_VALUES),
    operatorPhone: bbMobileNumber(),
    operatorEmail: "testing@govtech.bb",
    operatorBusinessName: `${faker.company.name()} Hotels Ltd`,

    groundFloor: buildFloor("Ground floor"),
    firstFloor: buildFloor("First floor"),

    staffMales: String(faker.number.int({ min: 0, max: 20 })),
    staffFemales: String(faker.number.int({ min: 1, max: 20 })),
    staffChangingRooms: String(faker.number.int({ min: 1, max: 6 })),
    staffLockers: String(faker.number.int({ min: 1, max: 40 })),
    staffHandWashBasins: String(faker.number.int({ min: 1, max: 10 })),
    staffWaterClosets: String(faker.number.int({ min: 1, max: 10 })),
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

/** Step 1 — new licence, or a renewal with its inline licence number. */
async function fillApplicationType(
  page: Page,
  data: Data,
  type: "new-licence" | "renew-licence",
): Promise<void> {
  const step = expectStep(page, "application-type");
  const licenceNumber = page.locator(`[id="${step}_hotel-licence-number"]`);
  await expect(licenceNumber).toBeHidden();
  await selectRadio(page, step, "application-type", type);
  if (type === "renew-licence") {
    await expect(licenceNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceNumber.fill(data.licenceNumber);
  } else {
    await expect(licenceNumber).toBeHidden();
  }
  await advance(page, step);
}

/** Step 2 — applying for yourself, or for someone else with permission. */
async function fillApplyingFor(
  page: Page,
  applyingFor: "yourself" | "someone-else",
): Promise<void> {
  const step = expectStep(page, "applying-for");
  await expect(page.locator("h1")).toContainText("Who are you applying for?");
  await selectRadio(page, step, "applying-for", applyingFor);
  if (applyingFor === "someone-else") {
    await selectRadio(page, step, "has-permission", "yes");
    await selectDropdown(
      page,
      step,
      "applicant-hotel-relationship",
      "representative",
    );
  }
  await advance(page, step);
}

/** Step 3 — the applicant, identical on every branch. */
async function fillYourDetails(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Tell us about yourself");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillField(page, step, "your-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "your-parish", data.applicantParish);
  await fillField(page, step, "contact-number", data.mobile);
  await fillField(page, step, "email", data.applicantEmail);
  await advance(page, step);
}

/**
 * Step 4 — who operates the hotel, plus the operator step that choice opens:
 * none for "i-do", `hotel-operator-details` for "another-person",
 * `hotel-operator-business` for "business".
 */
async function fillOperator(
  page: Page,
  data: Data,
  operator: "i-do" | "another-person" | "business",
): Promise<void> {
  let step = expectStep(page, "hotel-operator");
  await expect(page.locator("h1")).toContainText("Who operates the hotel?");
  const relationship = page.locator(
    `[id="${step}_operator-hotel-relationship"]`,
  );
  await selectDropdown(page, step, "hotel-operator-type", operator);
  if (operator === "another-person") {
    await expect(relationship).toBeVisible({ timeout: STEP_TIMEOUT });
    await selectDropdown(page, step, "operator-hotel-relationship", "director");
  } else {
    await expect(relationship).toBeHidden();
  }
  await advance(page, step);

  if (operator === "another-person") {
    step = expectStep(page, "hotel-operator-details");
    await expect(page.locator("h1")).toContainText(
      "Tell us about the hotel operator",
    );
    await fillField(page, step, "operator-first-name", data.operatorFirstName);
    await fillField(page, step, "operator-last-name", data.operatorLastName);
    await fillField(
      page,
      step,
      "operator-address-line-1",
      data.operatorAddressLine1,
    );
    await selectDropdown(page, step, "operator-parish", data.operatorParish);
    await fillField(page, step, "operator-contact-number", data.operatorPhone);
    await fillField(page, step, "operator-email", data.operatorEmail);
    await advance(page, step);
  } else if (operator === "business") {
    step = expectStep(page, "hotel-operator-business");
    await expect(page.locator("h1")).toContainText(
      "Tell us about the business or organisation",
    );
    await fillField(
      page,
      step,
      "operator-business-name",
      data.operatorBusinessName,
    );
    await fillField(
      page,
      step,
      "operator-business-address-line-1",
      data.operatorAddressLine1,
    );
    await selectDropdown(
      page,
      step,
      "operator-business-parish",
      data.operatorParish,
    );
    await fillField(
      page,
      step,
      "operator-business-contact-number",
      data.operatorPhone,
    );
    await fillField(page, step, "operator-business-email", data.operatorEmail);
    await advance(page, step);
  }
}

/**
 * The hotel itself. `addressLine2: "blank"` is the walk that proves #2791's
 * `required: false` holds; `"filled"` covers the populated side.
 */
async function fillHotelDetails(
  page: Page,
  data: Data,
  addressLine2: "blank" | "filled",
): Promise<void> {
  const step = expectStep(page, "hotel-details");
  await expect(page.locator("h1")).toContainText("Tell us about the hotel");
  await fillField(page, step, "hotel-name", data.hotelName);
  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "hotel-address-line-1",
      coordinatesFieldId: "hotel-address-coordinates",
    },
    data.hotelAddress,
  );

  // The geocoder writes line 2 from the picked suggestion, so the blank walk
  // has to clear what it wrote — leaving the field alone would test whatever
  // the faker-picked address happened to carry, not an empty value.
  const hotelAddressLine2 = page.locator(`[id="${step}_hotel-address-line-2"]`);
  await hotelAddressLine2.fill(
    addressLine2 === "blank" ? "" : data.hotelAddressLine2,
  );
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_hotel-parish"]`),
  ).not.toHaveValue("");
  await advance(page, step);
}

/** Fill one instance of the repeatable `floor-details` step. */
async function fillFloor(
  page: Page,
  stepId: string,
  floor: ReturnType<typeof buildFloor>,
  addAnother: "yes" | "no",
): Promise<void> {
  await fillField(page, stepId, "floor-name", floor.name);
  await fillField(page, stepId, "floor-number-of-rooms", floor.rooms);
  await fillField(page, stepId, "floor-number-of-occupants", floor.occupants);
  await fillField(
    page,
    stepId,
    "floor-number-of-water-closets",
    floor.waterClosets,
  );
  await fillField(
    page,
    stepId,
    "floor-rooms-with-water-closets",
    floor.roomsWithWaterClosets,
  );
  await fillField(page, stepId, "floor-number-of-baths", floor.baths);
  await fillField(page, stepId, "floor-rooms-with-baths", floor.roomsWithBaths);
  await fillField(page, stepId, "floor-number-of-basins", floor.basins);
  await fillField(
    page,
    stepId,
    "floor-rooms-with-basins",
    floor.roomsWithBasins,
  );
  await selectRadio(page, stepId, "addAnother", addAnother);
  await advance(page, stepId);
}

/** Staff numbers, then the staff facilities step that follows it. */
async function fillStaff(page: Page, data: Data): Promise<void> {
  let step = expectStep(page, "staff-details");
  await expect(page.locator("h1")).toContainText(
    "Tell us about the hotel staff",
  );
  await fillField(page, step, "staff-number-of-males", data.staffMales);
  await fillField(page, step, "staff-number-of-females", data.staffFemales);
  await advance(page, step);

  step = expectStep(page, "staff-facilities");
  await expect(page.locator("h1")).toContainText(
    "Tell us about staff facilities",
  );
  await fillField(page, step, "staff-changing-rooms", data.staffChangingRooms);
  await fillField(page, step, "staff-lockers", data.staffLockers);
  await fillField(
    page,
    step,
    "staff-hand-wash-basins",
    data.staffHandWashBasins,
  );
  await fillField(page, step, "staff-water-closets", data.staffWaterClosets);
  await advance(page, step);
}

/**
 * Amenities step — tick two amenities, then answer the per-amenity
 * "have you applied?" radio each one reveals. The other four radios stay
 * hidden (fieldConditionalOn `operator: "in"`), so they impose no required
 * validation.
 */
async function fillAmenities(page: Page): Promise<void> {
  const step = expectStep(page, "amenities");
  await expect(page.locator("h1")).toContainText("Other services at the hotel");

  const restaurantLicence = page.locator(
    `fieldset[id="${step}_restaurant-licence-applied"] input[type=radio][value="yes"]`,
  );
  await expect(restaurantLicence).toBeHidden();

  await tickCheckbox(page, step, "hotel-amenities", "swimming-pool");
  await tickCheckbox(page, step, "hotel-amenities", "restaurant");

  await expect(restaurantLicence).toBeVisible({ timeout: STEP_TIMEOUT });
  await selectRadio(page, step, "swimming-pool-licence-applied", "yes");
  await selectRadio(page, step, "restaurant-licence-applied", "no");
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await page
    .locator(`fieldset[id="${step}_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
}

/**
 * The confirmation copy substitutes {polyclinic} with the catchment the router
 * resolved from the geocoded address. The generic "your local polyclinic"
 * fallback means resolution failed, which would also break the polyclinic's
 * copy of the application — so assert a real name.
 */
async function expectRoutedPolyclinic(page: Page): Promise<void> {
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.beforeEach(({ page }) => mockGeocoder(page));

test.describe("Hotel Licence Application — Live Smoke", () => {
  test("submits a new licence, as the operator, with a site plan instead of a planning number", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillApplicationType(page, data, "new-licence");
    await fillApplyingFor(page, "yourself");
    await fillYourDetails(page, data);
    await fillOperator(page, data, "i-do");
    // Address line 2 left blank — optional since #2791.
    await fillHotelDetails(page, data, "blank");

    const floorStep = expectStep(page, "floor-details");
    await expect(page.locator("h1")).toContainText("Tell us about this floor");
    await fillFloor(page, floorStep, data.groundFloor, "no");

    await fillStaff(page, data);
    await fillAmenities(page);

    // ─── Planning — "no" opens the site-plan upload step ────────────────────
    let step = expectStep(page, "planning-and-site-plan");
    await expect(page.locator("h1")).toContainText("Planning and site plan");
    await selectRadio(page, step, "planning-applied", "no");
    await expect(
      page.locator(`[id="${step}_planning-application-number"]`),
    ).toBeHidden();
    await advance(page, step);

    step = expectStep(page, "upload-site-plan");
    await expect(page.locator("h1")).toContainText(
      "Upload the hotel site plan",
    );
    await expect(page.locator(`label[for="${step}_site-plan"]`)).toContainText(
      "Hotel site plan",
    );
    await uploadOne(page, step, "site-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.hotelName).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);
    await expectRoutedPolyclinic(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a new licence, for a business operator, with a planning number instead of a site plan", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillApplicationType(page, data, "new-licence");
    await fillApplyingFor(page, "yourself");
    await fillYourDetails(page, data);
    await fillOperator(page, data, "business");
    await fillHotelDetails(page, data, "filled");
    await fillFloor(
      page,
      expectStep(page, "floor-details"),
      data.groundFloor,
      "no",
    );
    await fillStaff(page, data);
    await fillAmenities(page);

    // ─── Planning — "yes" reveals the application number; no upload step ────
    let step = expectStep(page, "planning-and-site-plan");
    await selectRadio(page, step, "planning-applied", "yes");
    await fillField(
      page,
      step,
      "planning-application-number",
      data.planningApplicationNumber,
    );
    await advance(page, step);

    step = expectStep(page, "check-your-answers");
    await expect(
      page.getByText(data.planningApplicationNumber).first(),
    ).toBeVisible();
    await expect(
      page.getByText(data.operatorBusinessName).first(),
    ).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);
    await expectRoutedPolyclinic(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal for someone else, with a separate operator and two floors, skipping planning", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillApplicationType(page, data, "renew-licence");
    await fillApplyingFor(page, "someone-else");
    await fillYourDetails(page, data);
    await fillOperator(page, data, "another-person");
    await fillHotelDetails(page, data, "filled");

    // ─── Floors — "yes" to addAnother materialises a second instance ─────────
    const firstFloorStep = expectStep(page, "floor-details");
    await fillFloor(page, firstFloorStep, data.groundFloor, "yes");

    const secondFloorStep = expectStep(page, "floor-details");
    expect(
      secondFloorStep,
      "answering yes to addAnother must open a new floor instance",
    ).not.toBe(firstFloorStep);
    await fillFloor(page, secondFloorStep, data.firstFloor, "no");

    await fillStaff(page, data);
    await fillAmenities(page);

    // ─── Planning is new-licence only, so a renewal skips straight to review ─
    const step = expectStep(page, "check-your-answers");
    await expect(page.getByText(data.licenceNumber).first()).toBeVisible();
    await expect(
      page.getByText(data.operatorFirstName, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText(data.firstFloor.name).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);
    await expectRoutedPolyclinic(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
