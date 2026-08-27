/**
 * apply-for-hair-salon-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the hairdressing / beauty business licence
 * service (formId `apply-for-hair-salon-licence`, programme
 * `HAIR_SALON_LICENCE`).
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
 *     --config playwright.smoke.config.ts apply-for-hair-salon-licence
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
 *  - This form has NO step gates — every step is in the journey on every run.
 *    Both branches are inline field reveals on `business-details`, so the two
 *    tests differ only in what they answer there.
 *  - The premises-type select is `business-location-type`. It used to carry no
 *    `fieldId` override at all and answered to `components/generic-select`'s
 *    default (`generic-select`); the 2026-08-27 publish gave it a real name and
 *    retargeted the conditionals that read it.
 *  - `business-location-type` now drives the WHOLE business address block:
 *    "building" reveals `business-address-line-1` / `-line-2` / `-parish` /
 *    `-postcode`, and "vehicle" reveals `vehicle-licence` instead. The two
 *    tests take opposite sides, so only the building branch geocodes.
 *  - "renew" on `new-or-renew` reveals `licence-reference-number`. The second
 *    test takes it alongside the vehicle branch.
 *  - The business address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` =
 *    `business-details.business-address-coordinates`). We faker-pick from a pool
 *    of known-geocodable locations, select the first suggestion, then assert
 *    `business-address-coordinates` filled.
 *  - `business-address-postcode` is `components/postcode`: pattern-only
 *    (`^[Bb]{2} ?\d{5}$`), no required rule — so it must either be blank or a
 *    real-shaped postcode. We fill a valid one on the building branch; on the
 *    vehicle branch it is not on screen at all.
 *  - `owner-address-line-1` is `components/address` (required, minLength 5) and
 *    is NOT geocoded — plain faker street addresses are fine there.
 *  - `male-staff-count` / `female-staff-count` inherit
 *    `components/generic-number`'s required rule, so both block the step
 *    despite carrying no explicit override in the recipe. `staff-list` used to
 *    inherit the same way from `components/generic-file`; it is now
 *    `components/upload-document` (which ships NO validations) declaring
 *    `required` explicitly, alongside `fileTypes` + `itemMaxSize`. Both file
 *    fields accept PNG, so the uploads below are unaffected.
 *  - The confirmation step's `markdownContent` DOES open with the
 *    `{polyclinic}` token (added in #2550), but don't pin a polyclinic name:
 *    which one resolves depends on the faker-picked address, and the copy's
 *    Contact section lists all seven by name regardless, so a /Polyclinic/
 *    match proves nothing. We assert the stable Environmental Health copy.
 *  - CAVEAT on the vehicle branch: `catchmentRouting` reads
 *    `business-details.business-address-coordinates` and
 *    `business-details.business-address-parish`, and BOTH now live behind the
 *    "building" gate — a vehicle-based business answers neither, so catchment
 *    cannot resolve and `{polyclinic}` falls back to "your local polyclinic".
 *    That also means the MDA copy of the application has no polyclinic to go
 *    to. Deliberately NOT asserted either way here: the fallback is a product
 *    gap to fix in the recipe, not behaviour worth pinning in a test.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-hair-salon-licence";

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the business address is chosen from this pool.
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

/** Matches POSTCODE_FORMAT (`^[Bb]{2} ?\d{5}$`), e.g. "BB17004". */
function bbPostcode(): string {
  return `BB${faker.string.numeric(5)}`;
}

/** Build a complete, valid set of answers for either branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    // Timestamped so the resulting submission is easy to find in the target env.
    businessName: `Smoke Test Salon ${new Date().toISOString()}`,
    businessAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    businessAddressLine2: faker.location.street(),
    businessPostcode: bbPostcode(),
    vehicleLicence: `V-${faker.string.numeric(6)}`,
    licenceReferenceNumber: `HSL-${faker.string.numeric(5)}`,

    ownerName: `${faker.person.firstName()} ${faker.person.lastName()}`,
    ownerAddressLine1: faker.location.streetAddress(),
    ownerAddressLine2: faker.location.street(),
    ownerCityTown: faker.location.city(),
    ownerPostZipCode: bbPostcode(),

    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    telephone: bbMobileNumber(),

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
 * Fill the address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 *
 * Addressed by id rather than accessible name: the combobox's label is the
 * generic "Address line 1", which the owner's address on `owner-details` also
 * uses.
 */
export async function fillGeocodedBusinessAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.locator(`input[id="${stepId}_business-address-line-1"]`);
  await combo.click();
  // pressSequentially (not fill) so the debounced autocomplete actually fires.
  await combo.pressSequentially(query, { delay: 20 });

  // Scoped to this field's own listbox: a bare `getByRole("option")` would match
  // the premises-type <select>'s blank placeholder option, which sits earlier in
  // the DOM and is hidden while the select is closed.
  const firstSuggestion = page
    .locator(`ul[id="${stepId}_business-address-line-1-listbox"]`)
    .getByRole("option")
    .first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(
    `input[id="${stepId}_business-address-coordinates"]`,
  );
  await expect(
    coordinates,
    "geocoder did not populate the hidden business coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/**
 * Step 1 — the business, and the only step with branching. `premisesType`
 * "vehicle" reveals the vehicle licence; `application` "renew" reveals the
 * existing licence reference.
 */
export async function fillBusinessDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  premisesType: "building" | "vehicle",
  application: "new" | "renew",
): Promise<void> {
  const step = expectStep(page, "business-details");
  await expect(page.locator("h1")).toContainText("Business details");
  await fillField(page, step, "business-name", data.businessName);

  // ─── Premises type — "vehicle" reveals the vehicle licence inline ──────────
  const vehicleLicence = page.locator(`[id="${step}_vehicle-licence"]`);
  await expect(vehicleLicence).toBeHidden();
  await selectDropdown(page, step, "business-location-type", premisesType);
  if (premisesType === "vehicle") {
    await expect(vehicleLicence).toBeVisible({ timeout: STEP_TIMEOUT });
    await vehicleLicence.fill(data.vehicleLicence);
  } else {
    await expect(vehicleLicence).toBeHidden();
  }

  // ─── The address block rides the same gate — "building" only ──────────────
  const addressLine1 = page.locator(
    `input[id="${step}_business-address-line-1"]`,
  );
  if (premisesType === "building") {
    await expect(addressLine1).toBeVisible({ timeout: STEP_TIMEOUT });
    await fillGeocodedBusinessAddress(page, step, data.businessAddress);
    await fillField(
      page,
      step,
      "business-address-line-2",
      data.businessAddressLine2,
    );
    // The geocoder fills parish from the picked suggestion; assert rather than
    // overwrite, since that value is the catchment router's fallback.
    await expect(
      page.locator(`select[id="${step}_business-address-parish"]`),
    ).not.toHaveValue("");
    await fillField(
      page,
      step,
      "business-address-postcode",
      data.businessPostcode,
    );
  } else {
    // A vehicle has no premises address to give — see the catchment caveat in
    // the header note.
    await expect(addressLine1).toBeHidden();
    await expect(
      page.locator(`select[id="${step}_business-address-parish"]`),
    ).toBeHidden();
    await expect(
      page.locator(`input[id="${step}_business-address-postcode"]`),
    ).toBeHidden();
  }

  // ─── New or renew — "renew" reveals the existing licence reference ─────────
  const licenceReference = page.locator(
    `[id="${step}_licence-reference-number"]`,
  );
  await expect(licenceReference).toBeHidden();
  await selectRadio(page, step, "new-or-renew", application);
  if (application === "renew") {
    await expect(licenceReference).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceReference.fill(data.licenceReferenceNumber);
  } else {
    await expect(licenceReference).toBeHidden();
  }

  await advance(page, step);
}

/** Step 2 — the owner or operator, identical on both branches. */
export async function fillOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "owner-details");
  await expect(page.locator("h1")).toContainText("Owner or operator details");
  await fillField(page, step, "owner-name", data.ownerName);
  await fillField(page, step, "owner-address-line-1", data.ownerAddressLine1);
  await fillField(page, step, "owner-address-line-2", data.ownerAddressLine2);
  await fillField(page, step, "owner-city-town", data.ownerCityTown);
  await fillField(page, step, "owner-post-zip-code", data.ownerPostZipCode);
  // `components/country` carries no fieldId override, so it keeps the default.
  await selectDropdown(page, step, "country", "barbados");
  await advance(page, step);
}

/** Step 3 — contact details, identical on both branches. */
export async function fillContactDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "contact-details");
  await expect(page.locator("h1")).toContainText("Your contact details");
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "telephone", data.telephone);
  await advance(page, step);
}

/**
 * Step 4 — staff counts and uploads. Only `staff-list` is required among the
 * files; the optional `medical-certs` upload is exercised anyway so a real run
 * proves the whole upload path, not just the one field that blocks.
 */
export async function fillInformationUpload(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "information-upload");
  await expect(page.locator("h1")).toContainText("Upload documents");
  await fillField(page, step, "male-staff-count", data.maleStaffCount);
  await fillField(page, step, "female-staff-count", data.femaleStaffCount);
  await uploadOne(page, step, "staff-list", {
    name: "staff-list.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await uploadOne(page, step, "medical-certs", {
    name: "medical-certs.png",
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

test.describe("Register Hair & Beauty Business — Live Smoke", () => {
  test("submits a new licence for a building premises", async ({ page }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillBusinessDetails(page, data, "building", "new");
    await fillOwnerDetails(page, data);
    await fillContactDetails(page, data);
    await fillInformationUpload(page, data);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.businessName).first()).toBeVisible();
    await expect(page.getByText(data.ownerName).first()).toBeVisible();
    // The vehicle licence was never asked on the building branch.
    await expect(page.getByText(data.vehicleLicence)).toHaveCount(0);
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal for a vehicle premises, with both inline reveals", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillBusinessDetails(page, data, "vehicle", "renew");
    await fillOwnerDetails(page, data);
    await fillContactDetails(page, data);
    await fillInformationUpload(page, data);

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Both revealed fields made it into the review.
    await expect(page.getByText(data.vehicleLicence).first()).toBeVisible();
    await expect(
      page.getByText(data.licenceReferenceNumber).first(),
    ).toBeVisible();
    // ...and the gated-away business address did not.
    await expect(page.getByText(data.businessPostcode)).toHaveCount(0);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
