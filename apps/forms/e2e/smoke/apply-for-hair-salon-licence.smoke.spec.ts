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
 *  - `business-location-type` reveals `vehicle-licence` on "vehicle", and
 *    nothing else. The business address block used to ride the same gate
 *    ("building" only); the 2026-08-28 publish UNGATED it, so
 *    `business-address-line-1` / `-line-2` / `-parish` / `-postcode` are asked
 *    on both branches now and both tests geocode. Line 1 and parish carry no
 *    `required` override, so they inherit required:true from
 *    `components/address` / `components/parish` — a branch that skips them no
 *    longer advances.
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
 *    real-shaped postcode. We fill a valid one on both branches.
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
 *  - The vehicle-branch catchment gap is FIXED, and this spec is its
 *    regression test. `catchmentRouting` reads
 *    `business-details.business-address-coordinates` and
 *    `business-details.business-address-parish`; both used to sit behind the
 *    "building" gate, so a vehicle-based business answered neither, catchment
 *    could not resolve, `{polyclinic}` fell back to "your local polyclinic",
 *    and the MDA copy of the application had no polyclinic to go to. Ungating
 *    the address block closed that — so both branches now assert the generic
 *    fallback is ABSENT from the confirmation.
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

    ownerFirstName: faker.person.firstName(),
    ownerLastName: faker.person.lastName(),
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

  // ─── The address block — ungated, so asked on BOTH branches ───────────────
  const addressLine1 = page.locator(
    `input[id="${step}_business-address-line-1"]`,
  );
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

/**
 * Step 2 — the owner or operator, identical on both branches.
 *
 * The owner's name is two fields (`first-name` / `last-name`), not the single
 * `owner-name` this step used to carry: #2582 split it, and the webhook's
 * `applicant.name` mapping was repointed at the pair in the same PR.
 */
export async function fillOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "owner-details");
  await expect(page.locator("h1")).toContainText("Owner or operator details");
  await fillField(page, step, "first-name", data.ownerFirstName);
  await fillField(page, step, "last-name", data.ownerLastName);

  // ─── "Same as the business" hides the whole owner address block ───────────
  // Added by the same publish that ungated the business address. Toggle it to
  // prove the reveal, then leave it unticked so a real owner address is sent.
  // Checkbox ids are `${stepId}_${fieldId}-${optionValue}`, and this field's
  // single option repeats the fieldId — hence the doubled segment.
  const sameAsBusiness = page.locator(
    `input[type=checkbox][id="${step}_owner-address-same-as-business-owner-address-same-as-business"]`,
  );
  const ownerAddressLine1 = page.locator(
    `input[id="${step}_owner-address-line-1"]`,
  );
  await expect(ownerAddressLine1).toBeVisible();
  await sameAsBusiness.check();
  await expect(ownerAddressLine1).toBeHidden({ timeout: STEP_TIMEOUT });
  await sameAsBusiness.uncheck();
  await expect(ownerAddressLine1).toBeVisible({ timeout: STEP_TIMEOUT });

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

  // The confirmation markdown DOES open with the {polyclinic} token, so the
  // resolved-catchment name is on screen. Don't pin a name — which polyclinic
  // resolves depends on the faker-picked address. Assert the stable
  // Environmental Health copy, plus the ABSENCE of the generic fallback: that
  // is what proves catchment resolved, and on the vehicle branch it only holds
  // because the address block was ungated. See the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
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
    await expect(page.getByText(data.ownerFirstName).first()).toBeVisible();
    await expect(page.getByText(data.ownerLastName).first()).toBeVisible();
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
    // ...and so did the business address, which this branch used to be gated
    // out of entirely — the inverse of what this test asserted before.
    await expect(page.getByText(data.businessPostcode).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
