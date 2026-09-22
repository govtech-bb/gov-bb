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
 *  - Seven authored steps: `your-details`, `property-owner-details`,
 *    `property-details`, `unit-details-and-facilities`, `kitchen-facilities`,
 *    `amenities-other` and `supporting-documents`, then the platform's
 *    `check-your-answers` / `declaration` / `submission-confirmation`.
 *  - `unit-details-and-facilities` is the ONLY repeatable step (min 1, max 100)
 *    and has no sharedFields, so the base step IS unit 1 and carries the
 *    injected `addAnother` radio (`unit-details-and-facilities_addAnother`).
 *    Unit 2 lands on `unit-details-and-facilities~1`. NOTE the field ids on that
 *    step carry a literal `-1` suffix of their own (`barracks-name-1`,
 *    `number-of-rooms-1`, …) — that is part of the authored fieldId and does NOT
 *    change per instance; only the step id gains the `~1`. So unit 2's name
 *    field is `unit-details-and-facilities~1_barracks-name-1`.
 *  - Three conditional reveals, all `fieldConditionalOn`:
 *      · `is-property-owner` = "no" reveals BOTH `owner-full-name` and
 *        `applicant-role-owner` on `property-owner-details`;
 *      · `applicant-role-owner` = "other-role" then reveals
 *        `applicant-role-other`;
 *      · `water-supply-source-1` / `lighting-type-1` are CHECKBOX groups whose
 *        "other" options (`other-water-source` / `other-lighting`) reveal
 *        `water-supply-source-other-1` / `lighting-type-other-1` via the `in`
 *        operator (a checkbox submits a list);
 *      · `other-amenities` including `other-amenities-text` reveals
 *        `other-amenities-description`.
 *    An owner (`yes`) is therefore never asked the owner's name or their role —
 *    asserted in the first test, so a conditional that stops resolving fails
 *    loudly here rather than silently demanding an unanswerable field.
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
 *    empty.
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
    bunkBeds: String(faker.number.int({ min: 0, max: 10 })),
    showers: String(faker.number.int({ min: 1, max: 6 })),
    waterClosets: String(faker.number.int({ min: 1, max: 6 })),
    urinals: String(faker.number.int({ min: 0, max: 4 })),
    taps: String(faker.number.int({ min: 1, max: 6 })),
    sinks: String(faker.number.int({ min: 1, max: 6 })),
    otherWaterSource: "Delivered by water tanker (smoke test)",
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

    ownerFullName: faker.person.fullName(),
    applicantRoleOther: "Live-in caretaker for the owner (smoke test)",

    // The PROPERTY address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    propertyAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    propertyAddressLine2: faker.location.street(),
    propertyRooms: String(faker.number.int({ min: 2, max: 40 })),
    propertyOccupants: String(faker.number.int({ min: 2, max: 80 })),

    unitOne: buildUnit("Unit One"),
    unitTwo: buildUnit("Unit Two"),

    otherAmenities: "Shared laundry room and drying yard (smoke test)",
  };
}

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/** Step 1 — the applicant. A plain address; nothing here routes. */
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
 * Step 2 — ownership. "yes" asks nothing further; "no" reveals the owner's name
 * and the applicant's role, and role "other-role" reveals the free-text role.
 * The owner branch asserts the reveals stay hidden — that gate is the whole
 * point of the step.
 */
export async function fillPropertyOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  branch: {
    isOwner: "yes" | "no";
    role?: "manager" | "attorney" | "other-role";
  },
): Promise<void> {
  const step = expectStep(page, "property-owner-details");
  await expect(page.locator("h1")).toContainText(
    "Property ownership and owner details",
  );

  const ownerName = page.locator(`[id="${step}_owner-full-name"]`);
  const roleFieldset = page.locator(
    `fieldset[id="${step}_applicant-role-owner"]`,
  );
  const roleOther = page.locator(`[id="${step}_applicant-role-other"]`);

  await expect(ownerName).toBeHidden();
  await expect(roleFieldset).toBeHidden();

  await selectRadio(page, step, "is-property-owner", branch.isOwner);

  if (branch.isOwner === "no") {
    await expect(ownerName).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(roleFieldset).toBeVisible({ timeout: STEP_TIMEOUT });
    await ownerName.fill(data.ownerFullName);

    const role = branch.role ?? "manager";
    await expect(roleOther).toBeHidden();
    await selectRadio(page, step, "applicant-role-owner", role);
    if (role === "other-role") {
      await expect(roleOther).toBeVisible({ timeout: STEP_TIMEOUT });
      await roleOther.fill(data.applicantRoleOther);
    } else {
      await expect(roleOther).toBeHidden();
    }
  } else {
    // The gate's whole purpose: an owner is not asked who the owner is, nor
    // what their role at their own property is.
    await expect(ownerName).toBeHidden();
    await expect(roleFieldset).toBeHidden();
    await expect(roleOther).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 3 — where the property is. This is the step the catchment routes on, so
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
 * Step 4 — one instance of the repeatable barracks/lodging step.
 *
 * `stepId` is passed in rather than derived, because unit 2 lives on
 * `unit-details-and-facilities~1`. The field ids keep their authored `-1`
 * suffix on every instance — only the step id changes.
 *
 * `water-supply-source-1` and `lighting-type-1` are checkbox groups; picking
 * their "other" option reveals a free-text field via the `in` operator.
 */
export async function fillUnitDetails(
  page: Page,
  stepId: string,
  unit: ReturnType<typeof buildUnit>,
  branch: {
    waterSource:
      | "mains-water"
      | "rainwater-collection"
      | "well"
      | "other-water-source";
    lighting: "mains-electricity" | "generator" | "solar" | "other-lighting";
    addAnother: "yes" | "no";
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
  await fillField(
    page,
    stepId,
    "property-number-of-bunk-beds-1",
    unit.bunkBeds,
  );
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

  // ─── Water supply — a checkbox group; "other" reveals the free-text field ──
  const otherWater = page.locator(
    `[id="${stepId}_water-supply-source-other-1"]`,
  );
  await expect(otherWater).toBeHidden();
  await tickCheckbox(page, stepId, "water-supply-source-1", branch.waterSource);
  if (branch.waterSource === "other-water-source") {
    await expect(otherWater).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherWater.fill(unit.otherWaterSource);
  } else {
    await expect(otherWater).toBeHidden();
  }

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
  await advance(page, stepId);
}

/** Step 5 — the single kitchen question. */
export async function fillKitchenFacilities(
  page: Page,
  licensed: "yes" | "no" | "not-applicable",
): Promise<void> {
  const step = expectStep(page, "kitchen-facilities");
  await expect(page.locator("h1")).toContainText("Kitchen facilities");
  await selectRadio(page, step, "kitchen-licensed", licensed);
  await advance(page, step);
}

/**
 * Step 6 — other amenities. The whole checkbox group is optional, so the step
 * advances with nothing ticked; ticking `other-amenities-text` reveals a
 * description that is then required.
 */
export async function fillAmenities(
  page: Page,
  data: ReturnType<typeof buildData>,
  amenities: readonly (
    | "bar-licensed"
    | "restaurant-food-service"
    | "recreation-sports"
    | "salon-barber"
    | "other-amenities-text"
  )[],
): Promise<void> {
  const step = expectStep(page, "amenities-other");
  await expect(page.locator("h1")).toContainText(
    "Other amenities and facilities",
  );

  const description = page.locator(
    `[id="${step}_other-amenities-description"]`,
  );
  await expect(description).toBeHidden();
  for (const amenity of amenities) {
    await tickCheckbox(page, step, "other-amenities", amenity);
  }
  if (amenities.includes("other-amenities-text")) {
    await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
    await description.fill(data.otherAmenities);
  } else {
    await expect(description).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 7 — supporting documents. The upload is OPTIONAL and the step renders
 * unconditionally, so `upload: false` proves it advances empty.
 */
export async function fillSupportingDocuments(
  page: Page,
  upload: boolean,
): Promise<void> {
  const step = expectStep(page, "supporting-documents");
  await expect(page.locator("h1")).toContainText(
    "Supporting documents and licences",
  );
  if (upload) {
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
  test("submits as the property owner with one unit on mains services, never asked who owns the property", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data);
    // "yes" — the owner's name and the applicant's role stay hidden.
    await fillPropertyOwnerDetails(page, data, { isOwner: "yes" });
    const coordinates = await fillPropertyDetails(page, data);

    const unitStep = expectStep(page, "unit-details-and-facilities");
    await fillUnitDetails(page, unitStep, data.unitOne, {
      waterSource: "mains-water",
      lighting: "mains-electricity",
      addAnother: "no",
    });

    await fillKitchenFacilities(page, "yes");
    // Nothing ticked — the group is optional and the description must stay out.
    await fillAmenities(page, data, []);
    await fillSupportingDocuments(page, true);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.unitOne.name).first()).toBeVisible();
    // An owner was never asked who the owner is, so it cannot appear.
    await expect(page.getByText(data.ownerFullName)).toHaveCount(0);
    // The coordinate the catchment routes on was resolved from the PROPERTY
    // address. Logged so a real run can be traced to a polyclinic.
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] property coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits as a caretaker with two units, the second on its own repeat instance", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data);
    // "no" + "other-role" takes both reveals on the ownership step.
    await fillPropertyOwnerDetails(page, data, {
      isOwner: "no",
      role: "other-role",
    });
    const coordinates = await fillPropertyDetails(page, data);

    // ─── Units — "yes" to addAnother materialises a second instance ─────────
    const firstUnitStep = expectStep(page, "unit-details-and-facilities");
    await fillUnitDetails(page, firstUnitStep, data.unitOne, {
      waterSource: "other-water-source",
      lighting: "other-lighting",
      addAnother: "yes",
    });

    const secondUnitStep = expectStep(page, "unit-details-and-facilities");
    expect(
      secondUnitStep,
      "answering yes to addAnother must open a new barracks/lodging instance",
    ).not.toBe(firstUnitStep);
    await fillUnitDetails(page, secondUnitStep, data.unitTwo, {
      waterSource: "mains-water",
      lighting: "solar",
      addAnother: "no",
    });

    await fillKitchenFacilities(page, "not-applicable");
    await fillAmenities(page, data, [
      "restaurant-food-service",
      "other-amenities-text",
    ]);
    // The upload is optional — skipped here, so the step must still advance.
    await fillSupportingDocuments(page, false);

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Everything the non-owner route revealed made it into the review.
    await expect(page.getByText(data.ownerFullName).first()).toBeVisible();
    await expect(page.getByText(data.applicantRoleOther).first()).toBeVisible();
    await expect(page.getByText(data.otherAmenities).first()).toBeVisible();
    // Both units are on the review, and unit 1's "other" free-text with them.
    await expect(page.getByText(data.unitOne.name).first()).toBeVisible();
    await expect(page.getByText(data.unitTwo.name).first()).toBeVisible();
    await expect(
      page.getByText(data.unitOne.otherWaterSource).first(),
    ).toBeVisible();
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
