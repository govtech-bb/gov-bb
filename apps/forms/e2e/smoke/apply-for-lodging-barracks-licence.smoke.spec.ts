/**
 * apply-for-lodging-barracks-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the lodging house / barracks registration
 * service (formId `apply-for-lodging-barracks-licence` — the id predates the
 * switch from "licence" to "registration" and is kept so links do not break).
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
 *     --config playwright.smoke.config.ts apply-for-lodging-barracks-licence
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
 *  - Mostly one question per page. Steps in order: `application-type`,
 *    `property-owner-details` (are you the owner?), `your-details`,
 *    `owner-type` / `owner-details` / `owner-business-details` (not the owner
 *    only), `property-details`, `room-size-unit`, `room-sizes` (repeatable),
 *    `beds`, `toilets`, `showers`, `water-supply`, `lighting`,
 *    `amenities-other`, one "have you applied" step per service ticked, and
 *    `supporting-documents` (new registration only), then the platform's
 *    `check-your-answers` /
 *    `declaration` / `submission-confirmation`.
 *  - Every conditional step uses `stepConditionalOn`, and stacked conditions
 *    combine with AND: `owner-details` needs "not the owner" AND "a person",
 *    `owner-business-details` needs "not the owner" AND "a business".
 *  - `application-type` reveals a number on the same step
 *    (`fieldConditionalOn`): `renewal` the required `registration-number`,
 *    `new-registration` the OPTIONAL `planning-application-number`. Only
 *    `new-registration` opens `supporting-documents` (`stepConditionalOn`),
 *    which holds the OPTIONAL `site-plan` upload. Nothing forces one of the
 *    number or the site plan — the review PDF's either/or is not enforced.
 *  - `is-property-owner` = "no" reveals `applicant-role-owner` on the same
 *    step. It is a SELECT — 3 options, so Rule 8 forbids a radio — and
 *    "other-role" reveals `applicant-role-other`, which also repeats the "no"
 *    condition so a leftover "other-role" cannot show it to an owner.
 *  - `room-sizes` is the ONLY repeatable step (min 1, max 100) and has no
 *    sharedFields, so the base step IS room size 1 and carries the injected
 *    `addAnother` radio. Room size 2 lands on `room-sizes~1`. Its length,
 *    width and height fields come in a metres set and a feet set; the answer
 *    on `room-size-unit` shows one set, so each label names its unit.
 *    `rooms-of-this-size` is capped (`max` with a cross-step reference) at
 *    `property-details.property-number-of-rooms`; the first test asserts the
 *    cap. The platform cannot yet cap the TOTAL across room sizes or count the
 *    rooms left to add — the review PDF asks for both.
 *  - `property-number-of-bunk-beds` >= 1 (numeric `gte`) reveals
 *    `property-number-of-bunk-bed-spaces`, so a property with no bunk beds is
 *    never asked how many beds are in them. Bed, bunk-bed, toilet, urinal and
 *    shower counts all accept 0.
 *  - `water-supply-bwa` = "no" reveals a `components/content` warning and
 *    trips a `pattern: ^yes$` rule that BLOCKS Continue — the inline eligibility
 *    stop. Environmental Health will not register a property without a
 *    Barbados Water Authority supply, and the second test asserts the block
 *    rather than routing around it.
 *  - `lighting-type` is a CHECKBOX group whose "other" option
 *    (`other-lighting`) reveals `lighting-type-other` via the `in` operator.
 *  - `other-amenities` is optional (no "None of these" option yet — the
 *    platform has no exclusive checkbox option). Each service ticked opens its
 *    own "have you applied" step (`stepConditionalOn` with `in`); answering
 *    "no" shows a warning that the applicant can continue but must apply
 *    before the property can be registered — advisory, never a block.
 *  - The property address on `property-details` is the address-lookup
 *    (geocoder) field, so it cannot take a free-text faker address: the
 *    geocoder must return a real Barbados match to populate the hidden
 *    coordinates the catchment router reads (`catchmentRouting.coordinatesField`
 *    = `property-details.property-address-coordinates`). We faker-pick from a
 *    pool of known-geocodable locations, select the first suggestion, then
 *    assert the coordinates filled. `property-address-coordinates` renders as an
 *    `input[type=hidden]`, so assert its VALUE — never its visibility.
 *  - Picking a suggestion also fills `property-address-line-2` and
 *    `property-parish`. Line 2 is optional and a suggestion does not always
 *    carry one, so we overwrite it with faker data for a deterministic record;
 *    `property-parish` is asserted rather than overwritten, since that value is
 *    the catchment router's fallback (`catchmentRouting.parishField`).
 *  - `applicant-contact-number` is `components/telephone`, which validates with
 *    libphonenumber-js, so the number needs a real Barbados exchange — a random
 *    `246 NNN NNNN` is rejected.
 *  - `site-plan` lists bare extensions alongside the MIME types so an untyped
 *    `.jpg` is not refused (#2708). The first test uploads one; the renewal
 *    test never sees the step.
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    placeholder, substituted with the catchment resolved from the geocoded
 *    PROPERTY address. We assert the resolved Environmental Health copy rather
 *    than a specific polyclinic name, and assert the generic "your local
 *    polyclinic" fallback is absent, because that fallback means resolution
 *    failed and the MDA's copy of the application went nowhere.
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

export const FORM_ID = "apply-for-lodging-barracks-licence";

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
 * a suggestion is picked — so the PROPERTY address is chosen from this pool.
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

function bbPhoneNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/** One room size — a `room-sizes` instance. Decimals are allowed. */
function buildRoomSize(rooms: number) {
  return {
    length: String(faker.number.float({ min: 2, max: 6, fractionDigits: 1 })),
    width: String(faker.number.float({ min: 2, max: 6, fractionDigits: 1 })),
    height: String(faker.number.float({ min: 2, max: 4, fractionDigits: 1 })),
    rooms: String(rooms),
  };
}

/** Build a complete, valid set of answers for any branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  // Two room sizes that add up to the property's room count.
  const firstSizeRooms = faker.number.int({ min: 1, max: 6 });
  const secondSizeRooms = faker.number.int({ min: 1, max: 6 });

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    applicantAddress: faker.location.streetAddress(),
    applicantAddressLine2: faker.location.street(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbPhoneNumber(),

    // Renewals give their current registration number; new registrations give
    // a Planning and Development application number instead (or a site plan).
    registrationNumber: `LB/${faker.string.numeric(4)}/${faker.string.numeric(2)}`,
    planningApplicationNumber: `TCP/${faker.string.numeric(4)}/${faker.string.numeric(3)}`,

    ownerFirstName: faker.person.firstName(),
    ownerMiddleName: faker.person.middleName(),
    ownerLastName: faker.person.lastName(),
    ownerBusinessName: `${faker.company.name()} Ltd`,
    ownerAddress: faker.location.streetAddress(),
    ownerAddressLine2: faker.location.street(),
    ownerParish: faker.helpers.arrayElement(PARISH_VALUES),
    applicantRoleOther: "Live-in caretaker for the owner (smoke test)",

    // The PROPERTY address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    propertyAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    propertyAddressLine2: faker.location.street(),
    propertyRooms: String(firstSizeRooms + secondSizeRooms),
    propertyOccupants: String(faker.number.int({ min: 2, max: 80 })),

    roomSizeOne: buildRoomSize(firstSizeRooms),
    roomSizeTwo: buildRoomSize(secondSizeRooms),
    // Every room in one size, for the single-size route.
    roomSizeAll: buildRoomSize(firstSizeRooms + secondSizeRooms),

    beds: String(faker.number.int({ min: 2, max: 20 })),
    bunkBeds: String(faker.number.int({ min: 1, max: 10 })),
    bunkBedSpaces: String(faker.number.int({ min: 2, max: 20 })),
    toilets: String(faker.number.int({ min: 1, max: 6 })),
    urinals: String(faker.number.int({ min: 1, max: 4 })),
    showers: String(faker.number.int({ min: 1, max: 6 })),
    otherLighting: "Kerosene lamps (smoke test)",
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

/** Assert the step and its heading in one go; returns the step id. */
async function onStep(
  page: Page,
  stepId: string,
  heading: string,
): Promise<string> {
  const step = expectStep(page, stepId, { exact: true });
  await expect(page.locator("h1")).toContainText(heading);
  return step;
}

/**
 * New registration or renewal, each revealing its own number on the same
 * step: a renewal the current registration number (required), a new
 * registration the Planning and Development application number (optional, so
 * `planningNumber: false` proves the step advances without it). Only a new
 * registration later sees the site plan upload.
 */
export async function fillApplicationType(
  page: Page,
  data: Data,
  applicationType: "new-registration" | "renewal",
  { planningNumber = true }: { planningNumber?: boolean } = {},
): Promise<void> {
  const step = await onStep(
    page,
    "application-type",
    "Is this a new registration or a renewal?",
  );
  const registrationNumber = page.locator(`[id="${step}_registration-number"]`);
  const planningNumberInput = page.locator(
    `[id="${step}_planning-application-number"]`,
  );
  await expect(registrationNumber).toBeHidden();
  await expect(planningNumberInput).toBeHidden();
  await selectRadio(page, step, "application-type", applicationType);

  if (applicationType === "renewal") {
    await expect(registrationNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(planningNumberInput).toBeHidden();
    await registrationNumber.fill(data.registrationNumber);
  } else {
    await expect(planningNumberInput).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(registrationNumber).toBeHidden();
    if (planningNumber)
      await planningNumberInput.fill(data.planningApplicationNumber);
  }
  await advance(page, step);
}

/**
 * Are you the owner? "no" reveals the applicant's role on the same step (role
 * "other-role" reveals the free-text role); "yes" asks for neither.
 */
export async function fillOwnership(
  page: Page,
  data: Data,
  branch: {
    isOwner: "yes" | "no";
    role?: "manager" | "attorney" | "other-role";
  },
): Promise<void> {
  const step = await onStep(
    page,
    "property-owner-details",
    "Are you the property owner?",
  );
  const roleSelect = page.locator(`select[id="${step}_applicant-role-owner"]`);
  const roleOther = page.locator(`[id="${step}_applicant-role-other"]`);
  await expect(roleSelect).toBeHidden();
  await selectRadio(page, step, "is-property-owner", branch.isOwner);

  if (branch.isOwner === "no") {
    await expect(roleSelect).toBeVisible({ timeout: STEP_TIMEOUT });
    const role = branch.role ?? "manager";
    await expect(roleOther).toBeHidden();
    await selectDropdown(page, step, "applicant-role-owner", role);
    if (role === "other-role") {
      await expect(roleOther).toBeVisible({ timeout: STEP_TIMEOUT });
      await roleOther.fill(data.applicantRoleOther);
    } else {
      await expect(roleOther).toBeHidden();
    }
  } else {
    await expect(roleSelect).toBeHidden();
    await expect(roleOther).toBeHidden();
  }
  await advance(page, step);
}

/** The applicant. A plain address; nothing here routes. */
export async function fillYourDetails(page: Page, data: Data): Promise<void> {
  const step = await onStep(page, "your-details", "Tell us about yourself");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-middle-name", data.middleName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "address-line-1", data.applicantAddress);
  await fillField(page, step, "address-line-2", data.applicantAddressLine2);
  await selectDropdown(page, step, "address-parish", data.applicantParish);
  // components/telephone — validates with libphonenumber-js, so the exchange
  // has to be a real Barbados one.
  await fillField(page, step, "applicant-contact-number", data.phone);
  await fillField(page, step, "applicant-email", data.email);
  await advance(page, step);
}

/**
 * Who owns the property, then that owner's page: a person's name and address,
 * or a business or organisation's name and address. Only asked when the
 * applicant is not the owner.
 */
export async function fillOwner(
  page: Page,
  data: Data,
  ownerType: "person" | "business",
): Promise<void> {
  const step = await onStep(page, "owner-type", "Who owns the property?");
  await selectRadio(page, step, "owner-type", ownerType);
  await advance(page, step);

  if (ownerType === "person") {
    const ownerStep = await onStep(
      page,
      "owner-details",
      "Tell us about the property owner",
    );
    await fillField(page, ownerStep, "owner-first-name", data.ownerFirstName);
    await fillField(page, ownerStep, "owner-middle-name", data.ownerMiddleName);
    await fillField(page, ownerStep, "owner-last-name", data.ownerLastName);
    await fillField(page, ownerStep, "owner-address-line-1", data.ownerAddress);
    await fillField(
      page,
      ownerStep,
      "owner-address-line-2",
      data.ownerAddressLine2,
    );
    await selectDropdown(page, ownerStep, "owner-parish", data.ownerParish);
    await advance(page, ownerStep);
    return;
  }

  const businessStep = await onStep(
    page,
    "owner-business-details",
    "Tell us about the business or organisation",
  );
  await fillField(
    page,
    businessStep,
    "owner-business-name",
    data.ownerBusinessName,
  );
  await fillField(
    page,
    businessStep,
    "owner-business-address-line-1",
    data.ownerAddress,
  );
  await fillField(
    page,
    businessStep,
    "owner-business-address-line-2",
    data.ownerAddressLine2,
  );
  await selectDropdown(
    page,
    businessStep,
    "owner-business-parish",
    data.ownerParish,
  );
  await advance(page, businessStep);
}

/**
 * Where the property is, and its room and occupant counts. This is the step
 * the catchment routes on, so the geocoder MUST resolve: the helper asserts the
 * hidden coordinates filled rather than soft-skipping.
 */
export async function fillPropertyDetails(
  page: Page,
  data: Data,
): Promise<string> {
  const step = await onStep(
    page,
    "property-details",
    "Tell us about the property",
  );

  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "property-address-line-1",
      coordinatesFieldId: "property-address-coordinates",
    },
    data.propertyAddress,
  );
  await fillField(
    page,
    step,
    "property-address-line-2",
    data.propertyAddressLine2,
  );
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(page.locator(`[id="${step}_property-parish"]`)).toHaveAttribute(
    "data-value",
    /\S/,
  );

  await fillField(page, step, "property-number-of-rooms", data.propertyRooms);
  await fillField(
    page,
    step,
    "property-number-of-occupants",
    data.propertyOccupants,
  );
  await advance(page, step);
  return coordinates;
}

/** The unit for every room size: picks which set of L/W/H fields shows. */
export async function fillRoomSizeUnit(
  page: Page,
  unit: "metres" | "feet",
): Promise<void> {
  const step = await onStep(
    page,
    "room-size-unit",
    "Which unit will you use for the room sizes?",
  );
  await selectRadio(page, step, "room-size-unit", unit);
  await advance(page, step);
}

/**
 * One `room-sizes` instance. Only the chosen unit's fields show, and their
 * labels name the unit. `overCap` first enters more rooms than the property
 * has, to prove the cross-step `max` blocks Continue.
 */
export async function fillRoomSize(
  page: Page,
  stepId: string,
  size: ReturnType<typeof buildRoomSize>,
  branch: {
    unit: "metres" | "feet";
    addAnother: "yes" | "no";
    overCap?: number;
  },
): Promise<void> {
  await expect(page.locator("h1")).toContainText(
    "Tell us the size of the rooms",
  );
  const other = branch.unit === "metres" ? "feet" : "metres";
  await expect(
    page.locator(`[id="${stepId}_room-length-${other}"]`),
  ).toBeHidden();
  await expect(
    page.getByRole("spinbutton", { name: `Length in ${branch.unit}` }),
  ).toBeVisible();

  await fillField(page, stepId, `room-length-${branch.unit}`, size.length);
  await fillField(page, stepId, `room-width-${branch.unit}`, size.width);
  await fillField(page, stepId, `room-height-${branch.unit}`, size.height);
  await selectRadio(page, stepId, "addAnother", branch.addAnother);

  if (branch.overCap !== undefined) {
    await fillField(page, stepId, "rooms-of-this-size", String(branch.overCap));
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.locator(".govbb-error-summary")).toContainText(
      "cannot be more than the number of rooms at the property",
      { timeout: STEP_TIMEOUT },
    );
    expectStep(page, stepId, { exact: true });
  }

  await fillField(page, stepId, "rooms-of-this-size", size.rooms);
  await advance(page, stepId);
}

/**
 * Beds, bunk beds, toilets and showers. `bunkBeds: "none"` enters 0 bunk beds
 * and proves the bunk-bed-spaces follow-up stays away; `zeros` answers 0 to
 * every count that allows it.
 */
export async function fillFacilities(
  page: Page,
  data: Data,
  branch: { bunkBeds: "some" | "none"; zeros?: boolean },
): Promise<void> {
  const bedsStep = await onStep(page, "beds", "Tell us about the beds");
  const bunkSpaces = page.locator(
    `[id="${bedsStep}_property-number-of-bunk-bed-spaces"]`,
  );
  await expect(bunkSpaces).toBeHidden();
  await fillField(
    page,
    bedsStep,
    "property-number-of-beds",
    branch.zeros ? "0" : data.beds,
  );
  await fillField(
    page,
    bedsStep,
    "property-number-of-bunk-beds",
    branch.bunkBeds === "some" ? data.bunkBeds : "0",
  );
  if (branch.bunkBeds === "some") {
    await expect(bunkSpaces).toBeVisible({ timeout: STEP_TIMEOUT });
    await bunkSpaces.fill(data.bunkBedSpaces);
  } else {
    await expect(bunkSpaces).toBeHidden();
  }
  await advance(page, bedsStep);

  const toiletsStep = await onStep(
    page,
    "toilets",
    "Tell us about the toilets",
  );
  await fillField(
    page,
    toiletsStep,
    "property-number-of-toilets",
    branch.zeros ? "0" : data.toilets,
  );
  await fillField(
    page,
    toiletsStep,
    "property-number-of-urinals",
    branch.zeros ? "0" : data.urinals,
  );
  await advance(page, toiletsStep);

  const showersStep = await onStep(
    page,
    "showers",
    "How many showers are there?",
  );
  await fillField(
    page,
    showersStep,
    "property-number-of-showers",
    branch.zeros ? "0" : data.showers,
  );
  await advance(page, showersStep);
}

/**
 * Water supply. "yes" is the only answer that advances; `assertStop` first
 * answers "no" and proves the inline pattern error blocks Continue. Content
 * elements render with no id (a bare `div.govbb-warning-text`), so the notice
 * is located by class.
 */
export async function fillWaterSupply(
  page: Page,
  assertStop = false,
): Promise<void> {
  const step = await onStep(
    page,
    "water-supply",
    "Is the property connected to the Barbados Water Authority water supply?",
  );
  if (assertStop) {
    await selectRadio(page, step, "water-supply-bwa", "no");
    await expect(page.locator(".govbb-warning-text")).toContainText(
      "Barbados Water Authority",
      { timeout: STEP_TIMEOUT },
    );
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.locator(".govbb-error-summary")).toContainText(
      "must be connected to the Barbados Water Authority",
      { timeout: STEP_TIMEOUT },
    );
    expectStep(page, step, { exact: true });
  }
  await selectRadio(page, step, "water-supply-bwa", "yes");
  await expect(page.locator(".govbb-warning-text")).toHaveCount(0);
  await advance(page, step);
}

/** Lighting — a checkbox group whose "other" reveals a free-text field. */
export async function fillLighting(
  page: Page,
  data: Data,
  lighting:
    | "barbados-light-and-power"
    | "generator"
    | "solar"
    | "other-lighting",
): Promise<void> {
  const step = await onStep(
    page,
    "lighting",
    "What type of lighting does the property use?",
  );
  const otherLighting = page.locator(`[id="${step}_lighting-type-other"]`);
  await expect(otherLighting).toBeHidden();
  await tickCheckbox(page, step, "lighting-type", lighting);
  if (lighting === "other-lighting") {
    await expect(otherLighting).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherLighting.fill(data.otherLighting);
  } else {
    await expect(otherLighting).toBeHidden();
  }
  await advance(page, step);
}

/** The services on `amenities-other`, each with its own follow-up step. */
const SERVICE_FOLLOW_UPS = {
  "swimming-pool": "swimming-pool-licence-applied",
  "food-business": "food-business-licence-applied",
  restaurant: "restaurant-licence-applied",
  "hair-salon": "hair-salon-registration-applied",
  spa: "spa-registration-applied",
  "nail-salon": "nail-salon-registration-applied",
} as const;

type ServiceValue = keyof typeof SERVICE_FOLLOW_UPS;

/**
 * Other services at the property. The group is optional, so the step
 * advances with nothing ticked. Each ticked service opens its own "have you
 * applied" step, in option order; "no" shows an advisory warning that must
 * not stop the journey.
 */
export async function fillAmenities(
  page: Page,
  services: Partial<Record<ServiceValue, "yes" | "no">>,
): Promise<void> {
  const step = await onStep(
    page,
    "amenities-other",
    "What other services does the property have?",
  );
  const ticked = (Object.keys(SERVICE_FOLLOW_UPS) as ServiceValue[]).filter(
    (service) => service in services,
  );
  for (const service of ticked) {
    await tickCheckbox(page, step, "other-amenities", service);
  }
  await advance(page, step);

  for (const service of ticked) {
    const fieldId = SERVICE_FOLLOW_UPS[service];
    const followUp = expectStep(page, fieldId, { exact: true });
    await selectRadio(page, followUp, fieldId, services[service]!);
    const notice = page.locator(".govbb-warning-text");
    if (services[service] === "no") {
      await expect(notice).toContainText("You can continue now, but you must", {
        timeout: STEP_TIMEOUT,
      });
      await expect(notice).toContainText(
        "before the property can be registered",
      );
    } else {
      await expect(notice).toHaveCount(0);
    }
    await advance(page, followUp);
  }
}

/**
 * The site plan upload — a NEW registration only (`stepConditionalOn`), so a
 * renewal goes from the services straight to check-your-answers. The upload
 * is OPTIONAL, so `upload: false` proves the step advances empty.
 */
export async function fillSitePlan(page: Page, upload: boolean): Promise<void> {
  const step = await onStep(
    page,
    "supporting-documents",
    "Upload supporting documents",
  );
  if (upload) {
    await uploadOne(page, step, "site-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
  }
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = await onStep(
    page,
    "declaration",
    "Confirm and submit your application",
  );
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
  // property address; the generic fallback means resolution failed.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.beforeEach(({ page }) => mockGeocoder(page));

test.describe("Lodging House / Barracks Registration — Live Smoke", () => {
  test("registers a new property as the owner, with one room size in metres", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // A new registration — the Planning number, not the registration number.
    await fillApplicationType(page, data, "new-registration");
    // An owner is not asked their role and skips every owner page.
    await fillOwnership(page, data, { isOwner: "yes" });
    await fillYourDetails(page, data);
    const coordinates = await fillPropertyDetails(page, data);

    await fillRoomSizeUnit(page, "metres");
    const sizeStep = expectStep(page, "room-sizes");
    // More rooms than the property has is refused, then every room in one size.
    await fillRoomSize(page, sizeStep, data.roomSizeAll, {
      unit: "metres",
      addAnother: "no",
      overCap: Number(data.propertyRooms) + 1,
    });

    // Some bunk beds; every other count is 0, which must be accepted.
    await fillFacilities(page, data, { bunkBeds: "some", zeros: true });
    await fillWaterSupply(page);
    await fillLighting(page, data, "barbados-light-and-power");
    // Nothing ticked — the group is optional and no follow-up step may appear.
    await fillAmenities(page, {});
    await fillSitePlan(page, true);

    const step = await onStep(page, "check-your-answers", "Check your answers");
    await expect(
      page.getByText(data.planningApplicationNumber).first(),
    ).toBeVisible();
    await expect(page.getByText("site-plan.png").first()).toBeVisible();
    // An owner was never asked who the owner is, so it cannot appear.
    await expect(page.getByText(data.ownerFirstName)).toHaveCount(0);
    await expect(page.getByText(data.ownerBusinessName)).toHaveCount(0);
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] property coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("renews for another owner, with two room sizes in feet, and is never asked for Planning evidence", async ({
    page,
  }) => {
    const data = buildData();
    // Person or business, faker-picked (FAKER_SEED reproduces it), so both
    // owner pages get walked across runs.
    const ownerType = faker.helpers.arrayElement([
      "person",
      "business",
    ] as const);
    if (process.env.SMOKE_LOG_DATA)
      console.log(
        "[smoke-data]",
        JSON.stringify({ ...data, ownerType }, null, 2),
      );

    await openForm(page);
    await fillApplicationType(page, data, "renewal");
    // "no" + "other-role" takes every reveal on the role page.
    await fillOwnership(page, data, { isOwner: "no", role: "other-role" });
    await fillYourDetails(page, data);
    await fillOwner(page, data, ownerType);
    const coordinates = await fillPropertyDetails(page, data);

    await fillRoomSizeUnit(page, "feet");
    const firstSizeStep = expectStep(page, "room-sizes");
    await fillRoomSize(page, firstSizeStep, data.roomSizeOne, {
      unit: "feet",
      addAnother: "yes",
    });
    const secondSizeStep = expectStep(page, "room-sizes");
    expect(
      secondSizeStep,
      "answering yes to addAnother must open a new room size",
    ).not.toBe(firstSizeStep);
    await fillRoomSize(page, secondSizeStep, data.roomSizeTwo, {
      unit: "feet",
      addAnother: "no",
    });

    // No bunk beds — the spaces follow-up must stay away.
    await fillFacilities(page, data, { bunkBeds: "none" });
    // "no" is refused inline before "yes" lets the run continue.
    await fillWaterSupply(page, true);
    await fillLighting(page, data, "other-lighting");
    // A restaurant already licensed, a spa not yet — the "no" draws the
    // advisory notice, which must not stop the application.
    await fillAmenities(page, { restaurant: "yes", spa: "no" });

    // A renewal is never shown the site plan step.
    const step = await onStep(page, "check-your-answers", "Check your answers");
    await expect(page.getByText(data.registrationNumber).first()).toBeVisible();
    await expect(page.getByText(data.applicantRoleOther).first()).toBeVisible();
    const [askedName, skippedName] =
      ownerType === "person"
        ? [data.ownerFirstName, data.ownerBusinessName]
        : [data.ownerBusinessName, data.ownerFirstName];
    await expect(page.getByText(askedName).first()).toBeVisible();
    await expect(page.getByText(skippedName)).toHaveCount(0);
    await expect(page.getByText(data.otherLighting).first()).toBeVisible();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] property coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
