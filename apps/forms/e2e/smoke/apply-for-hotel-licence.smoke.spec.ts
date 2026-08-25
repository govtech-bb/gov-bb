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
 * Form-specific notes:
 *  - `application-type` drives two things: "renew-licence" reveals the inline
 *    `hotel-licence-number` field, and "new-licence" is what puts the whole
 *    `documents` step (required site plan) in the journey via stepConditionalOn.
 *    The two tests below cover both answers.
 *  - `is-operator` = "no" reveals the operator's name / phone / email inline
 *    (fieldConditionalOn, not a separate step); `your-role` = "another-role"
 *    likewise reveals `describe-your-role`.
 *  - The hotel address is an address-lookup (geocoder) field, so it cannot take
 *    a free-text faker address — the geocoder must return a real Barbados match
 *    to populate the hidden coordinates the catchment router reads. We
 *    faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `hotel-address-coordinates` filled.
 *  - `hotel-address-line-2` is hinted "Optional." but the recipe does NOT set
 *    `validations.required.value: false`, so it inherits components/address's
 *    required + minLength 5 and blocks the step. We fill it explicitly after
 *    the geocode rather than trust whatever line 2 the suggestion carried.
 *  - `floor-details` is a repeatable step (min 1, max 10) with no sharedFields,
 *    so the base step IS floor 1 and carries the injected `addAnother` radio;
 *    floor 2 lands on `floor-details~1`. The renewal test adds a second floor.
 *  - There is no National Registration Number on this form, so no Maskito-masked
 *    field to type digit-by-digit.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  currentStep,
  expectStep,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
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

/** Build a complete, valid set of answers for either branch. */
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
    describeYourRole: "Consultant acting for the owner (smoke test)",

    // Timestamped so the resulting submission is easy to find in the target env.
    hotelName: `Smoke Test Hotel ${new Date().toISOString()}`,
    hotelAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    hotelAddressLine2: faker.location.street(),
    maximumGuests: String(faker.number.int({ min: 10, max: 400 })),

    licenceNumber: `HTL-${faker.string.numeric(5)}`,

    operatorName: faker.company.name(),
    operatorPhone: bbMobileNumber(),
    operatorEmail: "testing@govtech.bb",

    groundFloor: buildFloor("Ground"),
    firstFloor: buildFloor("1"),

    staffMales: String(faker.number.int({ min: 0, max: 20 })),
    staffFemales: String(faker.number.int({ min: 1, max: 20 })),
    staffChangingRooms: String(faker.number.int({ min: 1, max: 6 })),
    staffLockers: String(faker.number.int({ min: 1, max: 40 })),
    staffHandWashBasins: String(faker.number.int({ min: 1, max: 10 })),
    staffWaterClosets: String(faker.number.int({ min: 1, max: 10 })),
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
 * Fill the address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 *
 * Addressed by id rather than accessible name: the combobox's label is the
 * generic "Address line 1", which the applicant's own address on `your-details`
 * also uses.
 */
export async function fillGeocodedHotelAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.locator(`input[id="${stepId}_hotel-address-line-1"]`);
  await combo.click();
  // pressSequentially (not fill) so the debounced autocomplete actually fires.
  await combo.pressSequentially(query, { delay: 20 });

  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(
    `input[id="${stepId}_hotel-address-coordinates"]`,
  );
  await expect(
    coordinates,
    "geocoder did not populate the hidden hotel coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/** Step 3 — the applicant, identical on both branches apart from the role. */
export async function fillYourDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  role: "owner" | "another-role",
): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillField(page, step, "your-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "your-parish", data.applicantParish);
  await fillField(page, step, "contact-number", data.mobile);
  await fillField(page, step, "email", data.applicantEmail);

  const describeRole = page.locator(`[id="${step}_describe-your-role"]`);
  await expect(describeRole).toBeHidden();
  await selectRadio(page, step, "your-role", role);
  if (role === "another-role") {
    await expect(describeRole).toBeVisible({ timeout: STEP_TIMEOUT });
    await describeRole.fill(data.describeYourRole);
  } else {
    await expect(describeRole).toBeHidden();
  }
  await advance(page, step);
}

/** Step 4 — the hotel itself, identical on both branches. */
export async function fillHotelDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "hotel-details");
  await expect(page.locator("h1")).toContainText("Tell us about the hotel");
  await fillField(page, step, "hotel-name", data.hotelName);
  await fillGeocodedHotelAddress(page, step, data.hotelAddress);
  // Line 2 inherits components/address's required + minLength 5 (the recipe
  // hints "Optional." but never sets required:false), so fill it rather than
  // rely on whatever the picked suggestion wrote.
  await fillField(page, step, "hotel-address-line-2", data.hotelAddressLine2);
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_hotel-parish"]`),
  ).not.toHaveValue("");
  await fillField(page, step, "maximum-number-of-guests", data.maximumGuests);
  await advance(page, step);
}

/** Fill one instance of the repeatable `floor-details` step. */
export async function fillFloor(
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

/** Step 6 — staff facilities, identical on both branches. */
export async function fillStaffDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "staff-details");
  await expect(page.locator("h1")).toContainText("Staff details");
  await fillField(page, step, "staff-number-of-males", data.staffMales);
  await fillField(page, step, "staff-number-of-females", data.staffFemales);
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

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await page
    .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
}

test.describe("Hotel Licence Application — Live Smoke", () => {
  test("submits a new licence, as the operator, with the required site plan", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);

    // ─── Application type — "new" hides the licence-number field ─────────────
    let step = expectStep(page, "application-type");
    await expect(
      page.locator(`[id="${step}_hotel-licence-number"]`),
    ).toBeHidden();
    await selectRadio(page, step, "application-type", "new-licence");
    await expect(
      page.locator(`[id="${step}_hotel-licence-number"]`),
    ).toBeHidden();
    await advance(page, step);

    // ─── Operator — "yes" keeps the three operator fields hidden ─────────────
    step = expectStep(page, "hotel-operator");
    await selectRadio(page, step, "is-operator", "yes");
    await expect(page.locator(`[id="${step}_operator-name"]`)).toBeHidden();
    await expect(
      page.locator(`[id="${step}_operator-contact-number"]`),
    ).toBeHidden();
    await advance(page, step);

    await fillYourDetails(page, data, "owner");
    await fillHotelDetails(page, data);

    // ─── Floors (repeatable, min 1) — one floor on this branch ───────────────
    step = expectStep(page, "floor-details");
    await expect(page.locator("h1")).toContainText("each floor of the hotel");
    await fillFloor(page, step, data.groundFloor, "no");

    await fillStaffDetails(page, data);

    // ─── Supporting documents — only in the journey on the new-licence branch ─
    step = expectStep(page, "documents");
    await expect(page.locator("h1")).toContainText("Supporting documents");
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

    // The confirmation copy substitutes {polyclinic} with the catchment the
    // router resolved from the geocoded address. The generic "your local
    // polyclinic" fallback means resolution failed (e.g. the recipe's
    // programme code not composing), which would also break the polyclinic's
    // copy of the application — so assert a real name.
    await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
    await expect(page.getByText("your local polyclinic")).toHaveCount(0);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal with a separate operator and two floors, skipping the documents step", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);

    // ─── Application type — "renew" reveals the licence number inline ────────
    let step = expectStep(page, "application-type");
    await selectRadio(page, step, "application-type", "renew-licence");
    const licenceNumber = page.locator(`[id="${step}_hotel-licence-number"]`);
    await expect(licenceNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceNumber.fill(data.licenceNumber);
    await advance(page, step);

    // ─── Operator — "no" reveals name, phone and email ───────────────────────
    step = expectStep(page, "hotel-operator");
    await selectRadio(page, step, "is-operator", "no");
    const operatorName = page.locator(`[id="${step}_operator-name"]`);
    await expect(operatorName).toBeVisible({ timeout: STEP_TIMEOUT });
    await operatorName.fill(data.operatorName);
    await fillField(page, step, "operator-contact-number", data.operatorPhone);
    await fillField(page, step, "operator-email", data.operatorEmail);
    await advance(page, step);

    await fillYourDetails(page, data, "another-role");
    await fillHotelDetails(page, data);

    // ─── Floors — "yes" to addAnother materialises a second instance ─────────
    const firstFloorStep = expectStep(page, "floor-details");
    await fillFloor(page, firstFloorStep, data.groundFloor, "yes");

    const secondFloorStep = expectStep(page, "floor-details");
    expect(
      secondFloorStep,
      "answering yes to addAnother must open a new floor instance",
    ).not.toBe(firstFloorStep);
    await fillFloor(page, secondFloorStep, data.firstFloor, "no");

    await fillStaffDetails(page, data);

    // The gate's whole purpose: the site plan is only asked for on a new
    // licence, so leaving staff-details lands straight on check-your-answers.
    expect(
      currentStep(page),
      "a renewal must skip the documents step",
    ).not.toContain("documents");

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.getByText(data.licenceNumber).first()).toBeVisible();
    await expect(page.getByText(data.operatorName).first()).toBeVisible();
    // Both floors made it into the review.
    await expect(page.getByText("Floor").first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
