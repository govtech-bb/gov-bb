/**
 * apply-for-lodging-barracks-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the lodging house / barracks licence service
 * (formId `apply-for-lodging-barracks-licence`).
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
 *  - Eight authored steps: `application-type`, `your-details`,
 *    `property-owner-details`, `property-details`,
 *    `unit-details-and-facilities`, `kitchen-facilities`, `amenities-other`
 *    and `supporting-documents`, then the platform's `check-your-answers` /
 *    `declaration` / `submission-confirmation`.
 *  - `application-type` opens the form and gates two later branches:
 *    `renew-licence` reveals `licence-number` on that same step, and
 *    `new-licence` is the only route that shows the Planning application
 *    number / site plan pair on `supporting-documents`.
 *  - `unit-details-and-facilities` is the ONLY repeatable step (min 1, max 100)
 *    and has no sharedFields, so the base step IS unit 1 and carries the
 *    injected `addAnother` radio (`unit-details-and-facilities_addAnother`).
 *    Unit 2 lands on `unit-details-and-facilities~1`. NOTE the field ids on that
 *    step carry a literal `-1` suffix of their own (`barracks-name-1`,
 *    `number-of-rooms-1`, …) — that is part of the authored fieldId and does NOT
 *    change per instance; only the step id gains the `~1`. So unit 2's name
 *    field is `unit-details-and-facilities~1_barracks-name-1`.
 *  - Conditional reveals, all `fieldConditionalOn` unless noted:
 *      · `is-property-owner` = "no" reveals the applicant's role AND the whole
 *        owner block (`owner-type`, the person or business fields, the owner's
 *        address and parish). Every owner field carries BOTH its own condition
 *        and the `is-property-owner` one, because form state is keep-but-hide:
 *        without the second condition `owner-type`'s retained value would keep
 *        the person fields on screen after a flip back to "yes";
 *      · `applicant-role-owner` is a SELECT — 3 options, so Rule 8 forbids a
 *        radio — and "other-role" reveals `applicant-role-other`;
 *      · `property-number-of-bunk-beds-1` >= 1 (numeric `gte`) reveals
 *        `property-number-of-bunk-bed-spaces-1`, so a property with no bunk
 *        beds is never asked how many spaces are in them;
 *      · `water-supply-bwa-1` = "no" reveals a `components/content` warning and
 *        trips a `pattern: ^yes$` rule that BLOCKS Continue. That is the
 *        service's stop condition — Environmental Health will not licence a
 *        property without a Barbados Water Authority supply — and the second
 *        test asserts the block rather than routing around it;
 *      · `lighting-type-1` is a CHECKBOX group whose "other" option
 *        (`other-lighting`) reveals `lighting-type-other-1` via the `in`
 *        operator (a checkbox submits a list);
 *      · each service ticked on `amenities-other` reveals its own "have you
 *        applied" radio, and answering "no" reveals an inset notice telling the
 *        applicant they can continue but must apply before the licence is
 *        granted;
 *      · `site-plan-toggle` is a `components/show-hide` (a native
 *        <details>/<summary>) that reveals `site-plan` and, via `optionalIf`,
 *        relaxes `planning-application-number` to optional — the either/or.
 *    An owner (`yes`) is therefore never asked who the owner is or what their
 *    role is — asserted in the first test, so a conditional that stops
 *    resolving fails loudly here rather than silently demanding an
 *    unanswerable field.
 *  - The property address on `property-details` is the address-lookup
 *    (geocoder) field, so it cannot take a free-text faker address: the
 *    geocoder must return a real Barbados match to populate the hidden
 *    coordinates the catchment router reads (`catchmentRouting.coordinatesField`
 *    = `property-details.property-address-coordinates`). We faker-pick from a
 *    pool of known-geocodable locations, select the first suggestion, then
 *    assert the coordinates filled. `property-address-coordinates` renders as an
 *    `input[type=hidden]`, so assert its VALUE — never its visibility.
 *  - Picking a suggestion also fills `property-address-line-2` and
 *    `property-parish`. Line 2 is optional here and a suggestion does not always
 *    carry one, so we overwrite it with faker data for a deterministic record;
 *    `property-parish` is asserted rather than overwritten, since that value is
 *    the catchment router's fallback (`catchmentRouting.parishField`).
 *  - The applicant address on `your-details` is a plain `components/address` —
 *    free-text faker data is fine, nothing routes on it.
 *  - `applicant-contact-number` is `components/telephone`, which validates with
 *    libphonenumber-js, so the number needs a real Barbados exchange — a random
 *    `246 NNN NNNN` is rejected.
 *  - `supporting-documents-upload` is OPTIONAL (`components/upload-document`
 *    with no required override) and the step renders unconditionally. The first
 *    test uploads a document; the second skips it, proving the step advances
 *    empty. It now accepts several files (`multiple: true`), and both uploads
 *    list bare extensions alongside the MIME types so an untyped `.jpg` is not
 *    refused (#2708).
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    placeholder, substituted with the catchment resolved from the geocoded
 *    PROPERTY address. We assert the resolved Environmental Health copy rather
 *    than a specific polyclinic name — which polyclinic depends on the address
 *    faker picked — and assert the generic "your local polyclinic" fallback is
 *    absent, because that fallback means resolution failed and the MDA's copy of
 *    the application went nowhere.
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

/** One barracks/lodging unit — the repeatable step's payload. */
function buildUnit(label: string) {
  return {
    // Timestamped so the resulting submission is easy to find in the target env.
    name: `Smoke Test ${label} ${new Date().toISOString()}`,
    rooms: String(faker.number.int({ min: 1, max: 12 })),
    dimensions: `${faker.number.int({ min: 3, max: 6 })}m x ${faker.number.int({ min: 3, max: 6 })}m per room`,
    beds: String(faker.number.int({ min: 2, max: 20 })),
    bunkBeds: String(faker.number.int({ min: 1, max: 10 })),
    // Only asked when bunkBeds >= 1 — one space per person who can sleep there.
    bunkBedSpaces: String(faker.number.int({ min: 2, max: 20 })),
    showers: String(faker.number.int({ min: 1, max: 6 })),
    waterClosets: String(faker.number.int({ min: 1, max: 6 })),
    urinals: String(faker.number.int({ min: 0, max: 4 })),
    taps: String(faker.number.int({ min: 1, max: 6 })),
    sinks: String(faker.number.int({ min: 1, max: 6 })),
    otherLighting: "Kerosene lamps (smoke test)",
  };
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

    // Renewals give their current licence number; new applications give a
    // Planning and Development application number instead (or a site plan).
    licenceNumber: `LB/${faker.string.numeric(4)}/${faker.string.numeric(2)}`,
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
    propertyRooms: String(faker.number.int({ min: 2, max: 40 })),
    propertyOccupants: String(faker.number.int({ min: 2, max: 80 })),

    unitOne: buildUnit("Unit One"),
    unitTwo: buildUnit("Unit Two"),
  };
}

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/**
 * Step 1 — new licence or renewal. A renewal is asked for its current licence
 * number; a new application is not, and is the only route that later sees the
 * Planning / site-plan pair. The unused reveal is asserted hidden either way.
 */
export async function fillApplicationType(
  page: Page,
  data: ReturnType<typeof buildData>,
  applicationType: "new-licence" | "renew-licence",
): Promise<void> {
  const step = expectStep(page, "application-type");
  await expect(page.locator("h1")).toContainText(
    "Are you applying for a new licence or renewing one?",
  );

  const licenceNumber = page.locator(`[id="${step}_licence-number"]`);
  await expect(licenceNumber).toBeHidden();

  await selectRadio(page, step, "application-type", applicationType);

  if (applicationType === "renew-licence") {
    await expect(licenceNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceNumber.fill(data.licenceNumber);
  } else {
    await expect(licenceNumber).toBeHidden();
  }

  await advance(page, step);
}

/** Step 2 — the applicant. A plain address; nothing here routes. */
export async function fillYourDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-middle-name", data.middleName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "address-line-1", data.applicantAddress);
  await fillField(page, step, "address-line-2", data.applicantAddressLine2);
  await selectDropdown(page, step, "address-parish", data.applicantParish);
  await fillField(page, step, "applicant-email", data.email);
  // components/telephone — validates with libphonenumber-js, so the exchange
  // has to be a real Barbados one.
  await fillField(page, step, "applicant-contact-number", data.phone);
  await advance(page, step);
}

/**
 * Step 3 — ownership. "yes" asks nothing further; "no" reveals the applicant's
 * role AND the owner block, which forks again on `owner-type`: a person gives a
 * name, a business gives an organisation name, and both give an address. Role
 * "other-role" reveals the free-text role. The owner branch asserts the reveals
 * stay hidden — that gate is the whole point of the step.
 */
export async function fillPropertyOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  branch: {
    isOwner: "yes" | "no";
    ownerType?: "person" | "business";
    role?: "manager" | "attorney" | "other-role";
  },
): Promise<void> {
  const step = expectStep(page, "property-owner-details");
  await expect(page.locator("h1")).toContainText(
    "Property ownership and owner details",
  );

  // `applicant-role-owner` is a SELECT now (3 options, Rule 8), so it is a
  // <select> element rather than a <fieldset> of radios.
  const roleSelect = page.locator(`select[id="${step}_applicant-role-owner"]`);
  const roleOther = page.locator(`[id="${step}_applicant-role-other"]`);
  const ownerTypeFieldset = page.locator(`fieldset[id="${step}_owner-type"]`);
  const ownerFirstName = page.locator(`[id="${step}_owner-first-name"]`);
  const ownerBusinessName = page.locator(`[id="${step}_owner-business-name"]`);
  const ownerAddress = page.locator(`[id="${step}_owner-address-line-1"]`);

  await expect(roleSelect).toBeHidden();
  await expect(ownerTypeFieldset).toBeHidden();

  await selectRadio(page, step, "is-property-owner", branch.isOwner);

  if (branch.isOwner === "no") {
    await expect(roleSelect).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(ownerTypeFieldset).toBeVisible({ timeout: STEP_TIMEOUT });

    const role = branch.role ?? "manager";
    await expect(roleOther).toBeHidden();
    await selectDropdown(page, step, "applicant-role-owner", role);
    if (role === "other-role") {
      await expect(roleOther).toBeVisible({ timeout: STEP_TIMEOUT });
      await roleOther.fill(data.applicantRoleOther);
    } else {
      await expect(roleOther).toBeHidden();
    }

    // Neither owner branch is open until owner-type is answered.
    await expect(ownerFirstName).toBeHidden();
    await expect(ownerBusinessName).toBeHidden();

    const ownerType = branch.ownerType ?? "person";
    await selectRadio(page, step, "owner-type", ownerType);

    if (ownerType === "person") {
      await expect(ownerFirstName).toBeVisible({ timeout: STEP_TIMEOUT });
      await expect(ownerBusinessName).toBeHidden();
      await ownerFirstName.fill(data.ownerFirstName);
      await fillField(page, step, "owner-middle-name", data.ownerMiddleName);
      await fillField(page, step, "owner-last-name", data.ownerLastName);
    } else {
      await expect(ownerBusinessName).toBeVisible({ timeout: STEP_TIMEOUT });
      await expect(ownerFirstName).toBeHidden();
      await ownerBusinessName.fill(data.ownerBusinessName);
    }

    // The owner's address is asked for either kind of owner.
    await expect(ownerAddress).toBeVisible({ timeout: STEP_TIMEOUT });
    await ownerAddress.fill(data.ownerAddress);
    await fillField(page, step, "owner-address-line-2", data.ownerAddressLine2);
    await selectDropdown(page, step, "owner-parish", data.ownerParish);
  } else {
    // The gate's whole purpose: an owner is not asked who the owner is, what
    // kind of owner they are, where the owner lives, nor what their role at
    // their own property is.
    await expect(roleSelect).toBeHidden();
    await expect(roleOther).toBeHidden();
    await expect(ownerTypeFieldset).toBeHidden();
    await expect(ownerFirstName).toBeHidden();
    await expect(ownerBusinessName).toBeHidden();
    await expect(ownerAddress).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 4 — where the property is. This is the step the catchment routes on, so
 * the geocoder MUST resolve: the helper asserts the hidden coordinates filled
 * rather than soft-skipping, because an empty one means the submission reaches
 * no polyclinic at all.
 */
export async function fillPropertyDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<string> {
  const step = expectStep(page, "property-details");
  await expect(page.locator("h1")).toContainText("Property details");

  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "property-address-line-1",
      coordinatesFieldId: "property-address-coordinates",
    },
    data.propertyAddress,
  );
  // Line 2 is optional and a suggestion does not always carry one — overwrite
  // it so the submitted record is deterministic.
  await fillField(
    page,
    step,
    "property-address-line-2",
    data.propertyAddressLine2,
  );
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_property-parish"]`),
  ).not.toHaveValue("");

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

/**
 * Step 5 — one instance of the repeatable barracks/lodging step.
 *
 * `stepId` is passed in rather than derived, because unit 2 lives on
 * `unit-details-and-facilities~1`. The field ids keep their authored `-1`
 * suffix on every instance — only the step id changes.
 *
 * `bunkBeds: "none"` proves the bunk-bed-spaces follow-up stays away when there
 * are no bunk beds. `lighting-type-1` is a checkbox group; picking its "other"
 * option reveals a free-text field via the `in` operator. Water supply is now a
 * yes/no gate rather than a source menu — "no" is a stop, so this helper only
 * takes the passing answer (the block itself is asserted separately).
 */
export async function fillUnitDetails(
  page: Page,
  stepId: string,
  unit: ReturnType<typeof buildUnit>,
  branch: {
    bunkBeds: "some" | "none";
    lighting: "mains-electricity" | "generator" | "solar" | "other-lighting";
    addAnother: "yes" | "no";
    /** Prove "no" to the water supply actually stops the application. */
    waterSupplyStop?: boolean;
  },
): Promise<void> {
  await expect(page.locator("h1")).toContainText(
    "Barracks/lodging information and facilities",
  );

  await fillField(page, stepId, "barracks-name-1", unit.name);
  await fillField(page, stepId, "number-of-rooms-1", unit.rooms);
  await fillField(page, stepId, "room-dimensions-1", unit.dimensions);
  await selectRadio(page, stepId, "sleeping-accommodation-segregated-1", "yes");
  await fillField(page, stepId, "property-number-of-beds-1", unit.beds);

  // ─── Bunk beds — the spaces follow-up only appears when there is at least
  // one bunk bed (numeric `gte` conditional). ───────────────────────────────
  const bunkSpaces = page.locator(
    `[id="${stepId}_property-number-of-bunk-bed-spaces-1"]`,
  );
  await expect(bunkSpaces).toBeHidden();
  await fillField(
    page,
    stepId,
    "property-number-of-bunk-beds-1",
    branch.bunkBeds === "some" ? unit.bunkBeds : "0",
  );
  if (branch.bunkBeds === "some") {
    await expect(bunkSpaces).toBeVisible({ timeout: STEP_TIMEOUT });
    await bunkSpaces.fill(unit.bunkBedSpaces);
  } else {
    await expect(bunkSpaces).toBeHidden();
  }

  await selectRadio(page, stepId, "sanitary-facilities-segregated-1", "yes");
  await fillField(page, stepId, "property-number-of-showers-1", unit.showers);
  await fillField(
    page,
    stepId,
    "property-number-of-water-closets-1",
    unit.waterClosets,
  );
  await fillField(page, stepId, "property-number-of-urinals-1", unit.urinals);
  await fillField(page, stepId, "property-number-of-taps-1", unit.taps);
  await fillField(page, stepId, "property-number-of-sinks-1", unit.sinks);

  // ─── Water supply — Environmental Health will not licence a property that
  // is not on the Barbados Water Authority supply, so "yes" is the only answer
  // that advances. Content elements render with no id (a bare
  // `div.govbb-warning-text`), so the notice is located by class, never by a
  // field id that would silently match nothing. ────────────────────────────
  await selectRadio(page, stepId, "water-supply-bwa-1", "yes");
  await expect(page.locator(".govbb-warning-text")).toHaveCount(0);

  // ─── Lighting — same shape ────────────────────────────────────────────────
  const otherLighting = page.locator(`[id="${stepId}_lighting-type-other-1"]`);
  await expect(otherLighting).toBeHidden();
  await tickCheckbox(page, stepId, "lighting-type-1", branch.lighting);
  if (branch.lighting === "other-lighting") {
    await expect(otherLighting).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherLighting.fill(unit.otherLighting);
  } else {
    await expect(otherLighting).toBeHidden();
  }

  await selectRadio(page, stepId, "addAnother", branch.addAnother);

  // ─── The stop condition, asserted rather than routed around ──────────────
  // Left until every other field on the step is answered: a half-filled step
  // would raise required errors of its own and the summary would no longer
  // prove which rule did the stopping.
  if (branch.waterSupplyStop) {
    await selectRadio(page, stepId, "water-supply-bwa-1", "no");
    await expect(page.locator(".govbb-warning-text")).toContainText(
      "Barbados Water Authority",
      { timeout: STEP_TIMEOUT },
    );
    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(page.locator(".govbb-error-summary")).toContainText(
      "must be connected to the Barbados Water Authority",
      { timeout: STEP_TIMEOUT },
    );
    expectStep(page, stepId, { exact: true });

    // Back to a licensable property so the run can finish and submit.
    await selectRadio(page, stepId, "water-supply-bwa-1", "yes");
    await expect(page.locator(".govbb-warning-text")).toHaveCount(0);
    await expect(page.locator(".govbb-error-summary")).toBeHidden();
  }

  await advance(page, stepId);
}

/**
 * Step 6 — the single kitchen question. Three options, so it is a SELECT: a
 * radio here would break Rule 8.
 */
export async function fillKitchenFacilities(
  page: Page,
  licensed: "yes" | "no" | "not-applicable",
): Promise<void> {
  const step = expectStep(page, "kitchen-facilities");
  await expect(page.locator("h1")).toContainText("Kitchen facilities");
  await selectDropdown(page, step, "kitchen-licensed", licensed);
  await advance(page, step);
}

/** The services on `amenities-other`, each with its own follow-up radio. */
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
 * Step 7 — other services at the property. The whole checkbox group is optional
 * ("leave blank if none apply" — there is no exclusive "none of these" option),
 * so the step advances with nothing ticked. Ticking a service reveals its own
 * "have you applied" radio, and answering "no" draws an inset notice saying the
 * applicant can continue but must apply before the licence is granted — an
 * advisory, never a block.
 */
export async function fillAmenities(
  page: Page,
  services: Partial<Record<ServiceValue, "yes" | "no">>,
): Promise<void> {
  const step = expectStep(page, "amenities-other");
  await expect(page.locator("h1")).toContainText(
    "Other amenities and facilities",
  );

  // Every follow-up starts hidden — nothing is asked until a service is ticked.
  for (const fieldId of Object.values(SERVICE_FOLLOW_UPS)) {
    await expect(
      page.locator(`fieldset[id="${step}_${fieldId}"]`),
    ).toBeHidden();
  }

  for (const [service, answer] of Object.entries(services) as [
    ServiceValue,
    "yes" | "no",
  ][]) {
    const fieldId = SERVICE_FOLLOW_UPS[service];
    await tickCheckbox(page, step, "other-amenities", service);
    await expect(page.locator(`fieldset[id="${step}_${fieldId}"]`)).toBeVisible(
      {
        timeout: STEP_TIMEOUT,
      },
    );
    await selectRadio(page, step, fieldId, answer);
  }

  // A "no" anywhere draws its advisory notice; it must not stop the journey.
  const insets = page.locator(".govbb-inset-text");
  const expectedNotices = Object.values(services).filter(
    (answer) => answer === "no",
  ).length;
  await expect(insets).toHaveCount(expectedNotices);
  if (expectedNotices > 0) {
    await expect(insets.first()).toContainText("You can continue now");
  }

  await advance(page, step);
}

/**
 * Step 8 — supporting documents.
 *
 * A NEW licence must account for Planning and Development: either the
 * application number, or a site plan uploaded behind the `site-plan-toggle`
 * show-hide. The toggle relaxes the number to optional (`optionalIf`), so
 * exactly one of the two is ever demanded. A RENEWAL sees neither.
 *
 * `supporting-documents-upload` is OPTIONAL and renders unconditionally, so
 * `upload: false` proves the step advances empty.
 */
export async function fillSupportingDocuments(
  page: Page,
  data: ReturnType<typeof buildData>,
  branch: {
    applicationType: "new-licence" | "renew-licence";
    planningEvidence?: "application-number" | "site-plan";
    upload: boolean;
  },
): Promise<void> {
  const step = expectStep(page, "supporting-documents");
  await expect(page.locator("h1")).toContainText(
    "Supporting documents and licences",
  );

  const planningNumber = page.locator(
    `[id="${step}_planning-application-number"]`,
  );
  const sitePlanToggle = page.locator("details.govbb-show-hide summary", {
    hasText: "Upload a site plan instead",
  });

  if (branch.applicationType === "new-licence") {
    await expect(planningNumber).toBeVisible({ timeout: STEP_TIMEOUT });

    if (branch.planningEvidence === "site-plan") {
      // The either/or: opening the toggle reveals the upload and relaxes the
      // number, so the step submits with the plan and no number at all.
      await expect(page.locator(`input[id="${step}_site-plan"]`)).toBeHidden();
      await sitePlanToggle.click();
      await uploadOne(page, step, "site-plan", {
        name: "site-plan.png",
        mimeType: TEST_PNG.mimeType,
        buffer: TEST_PNG.buffer,
      });
    } else {
      // Prove the alternative is reachable before taking the number route:
      // opening the toggle reveals the upload (and is what relaxes the number),
      // collapsing it takes the field back out of the form entirely.
      const sitePlanInput = page.locator(`input[id="${step}_site-plan"]`);
      await expect(sitePlanInput).toBeHidden();
      await sitePlanToggle.click();
      await expect(sitePlanInput).toBeVisible({ timeout: STEP_TIMEOUT });
      await sitePlanToggle.click();
      await expect(sitePlanInput).toBeHidden();

      await planningNumber.fill(data.planningApplicationNumber);
    }
  } else {
    // A renewal already holds a licence — Planning does not come into it.
    await expect(planningNumber).toBeHidden();
    await expect(sitePlanToggle).toBeHidden();
  }

  if (branch.upload) {
    await uploadOne(page, step, "supporting-documents-upload", {
      name: "supporting-document.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
  }
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Declaration");
  await page
    .locator(`fieldset[id="${step}_declaration-confirmed"]`)
    .getByRole("checkbox")
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });

  // The recipe's "What happens next" copy, carried in `markdownContent`.
  await expect(
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  // `{polyclinic}` is substituted with the catchment resolved from the geocoded
  // property address. The generic "your local polyclinic" fallback means
  // resolution failed, which would also mean the polyclinic never got its copy
  // of the application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.describe("Lodging House / Barracks Licence — Live Smoke", () => {
  test("submits a new licence as the property owner with one unit, never asked who owns the property", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // A new licence — no licence number asked, Planning evidence required later.
    await fillApplicationType(page, data, "new-licence");
    await fillYourDetails(page, data);
    // "yes" — the owner block and the applicant's role stay hidden.
    await fillPropertyOwnerDetails(page, data, { isOwner: "yes" });
    const coordinates = await fillPropertyDetails(page, data);

    const unitStep = expectStep(page, "unit-details-and-facilities");
    await fillUnitDetails(page, unitStep, data.unitOne, {
      bunkBeds: "some",
      lighting: "mains-electricity",
      addAnother: "no",
    });

    await fillKitchenFacilities(page, "yes");
    // Nothing ticked — the group is optional and no follow-up may appear.
    await fillAmenities(page, {});
    await fillSupportingDocuments(page, data, {
      applicationType: "new-licence",
      planningEvidence: "application-number",
      upload: true,
    });

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.unitOne.name).first()).toBeVisible();
    await expect(
      page.getByText(data.planningApplicationNumber).first(),
    ).toBeVisible();
    // An owner was never asked who the owner is, so it cannot appear.
    await expect(page.getByText(data.ownerFirstName)).toHaveCount(0);
    await expect(page.getByText(data.ownerBusinessName)).toHaveCount(0);
    // The coordinate the catchment routes on was resolved from the PROPERTY
    // address. Logged so a real run can be traced to a polyclinic.
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] property coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("renews as a caretaker for a business owner, with two units, and is never asked for Planning evidence", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // A renewal — the current licence number is asked for here.
    await fillApplicationType(page, data, "renew-licence");
    await fillYourDetails(page, data);
    // "no" + "other-role" + a business owner takes every reveal on the step.
    await fillPropertyOwnerDetails(page, data, {
      isOwner: "no",
      ownerType: "business",
      role: "other-role",
    });
    const coordinates = await fillPropertyDetails(page, data);

    // ─── Units — "yes" to addAnother materialises a second instance ─────────
    const firstUnitStep = expectStep(page, "unit-details-and-facilities");
    await fillUnitDetails(page, firstUnitStep, data.unitOne, {
      bunkBeds: "some",
      lighting: "other-lighting",
      addAnother: "yes",
      waterSupplyStop: true,
    });

    const secondUnitStep = expectStep(page, "unit-details-and-facilities");
    expect(
      secondUnitStep,
      "answering yes to addAnother must open a new barracks/lodging instance",
    ).not.toBe(firstUnitStep);
    // No bunk beds on unit 2 — the spaces follow-up must stay away.
    await fillUnitDetails(page, secondUnitStep, data.unitTwo, {
      bunkBeds: "none",
      lighting: "solar",
      addAnother: "no",
    });

    await fillKitchenFacilities(page, "not-applicable");
    // A restaurant already licensed, a spa not yet — the "no" draws the
    // advisory notice, which must not stop the application.
    await fillAmenities(page, { restaurant: "yes", spa: "no" });
    // A renewal is asked for no Planning evidence, and the upload is optional —
    // skipped here, so the step must still advance.
    await fillSupportingDocuments(page, data, {
      applicationType: "renew-licence",
      upload: false,
    });

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Everything the renewal and non-owner routes revealed made it into review.
    await expect(page.getByText(data.licenceNumber).first()).toBeVisible();
    await expect(page.getByText(data.ownerBusinessName).first()).toBeVisible();
    await expect(page.getByText(data.applicantRoleOther).first()).toBeVisible();
    // A business owner is never asked for a person's name, so it cannot appear.
    await expect(page.getByText(data.ownerFirstName)).toHaveCount(0);
    // Both units are on the review, and unit 1's "other" free-text with them.
    await expect(page.getByText(data.unitOne.name).first()).toBeVisible();
    await expect(page.getByText(data.unitTwo.name).first()).toBeVisible();
    await expect(
      page.getByText(data.unitOne.otherLighting).first(),
    ).toBeVisible();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] property coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
