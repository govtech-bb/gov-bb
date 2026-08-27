/**
 * apply-for-hairdresser-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Hairdresser Licence service
 * (formId `apply-for-hairdresser-licence`, programme `HAIRDRESSER_LICENCE`).
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
 *     --config playwright.smoke.config.ts apply-for-hairdresser-licence
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
 *  - `workplace-details` has no step-level gate — every submission visits it
 *    (the old `workplace-known` step and its stepConditionalOn were dropped
 *    from the recipe on 2026-08-24). The two tests below instead cover the
 *    two ends of the step's own checkbox-driven inline reveals: one ticks
 *    options that reveal every conditional field, the other ticks an option
 *    that reveals none.
 *  - `workplace-locations` is a CHECKBOX field (operator "in"), not a radio, and
 *    it drives two independent inline reveals: "at-salon" reveals salon name /
 *    address line 1 / line 2 / parish, and "somewhere-else" reveals the
 *    free-text `somewhere-else`. The first test ticks both to exercise both
 *    reveals in one pass; checkbox ids follow the same
 *    `${stepId}_${fieldId}-${value}` shape as radios. The second test ticks
 *    "from-home" alone, which reveals neither.
 *  - The applicant's address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` = `personal-details.address-coordinates`).
 *    We faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `address-coordinates` filled.
 *  - `address-line-2` (`components/address`) has the recipe's
 *    `validations.required.value: false` override, so it's optional here —
 *    unlike `salon-address-line-1` below, which has no such override and
 *    inherits `components/address`'s required + minLength 5. We still fill
 *    line 2 explicitly after the geocode rather than trust whatever line 2
 *    the picked suggestion carried.
 *  - Both `documents` uploads (`passport-photo`, `medical-certificate`) are
 *    required single-file fields, so each needs its own confirmed upload.
 *  - UNLIKE apply-for-hotel-licence, this recipe's confirmation step uses
 *    generic `nextSteps` copy and no `{polyclinic}` placeholder, so there is no
 *    resolved-catchment name on the confirmation screen to assert. Catchment
 *    routing still runs (it drives the MDA email), it just isn't surfaced to
 *    the applicant — so these tests assert the Environmental Health copy
 *    instead. Don't add a /Polyclinic/ assertion here; it would fail.
 *  - There is no National Registration Number on this form, so no Maskito-masked
 *    field to type digit-by-digit.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillField,
  selectDropdown,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-hairdresser-licence";

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
 * a suggestion is picked — so the applicant address is chosen from this pool.
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

/** Build a complete, valid set of answers for either branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    address: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    addressLine2: faker.location.street(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbMobileNumber(),

    // Timestamped so the resulting submission is easy to find in the target env.
    salonName: `Smoke Test Salon ${new Date().toISOString()}`,
    salonAddressLine1: faker.location.streetAddress(),
    salonAddressLine2: faker.location.street(),
    salonParish: faker.helpers.arrayElement(PARISH_VALUES),
    somewhereElse: "Mobile — client homes across the island (smoke test)",
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
 * Tick one option of a multi-option checkbox field. Checkbox inputs share the
 * `${stepId}_${fieldId}-${value}` id shape with radios, so this mirrors
 * `selectRadio` from the shared helpers (which is radio-only by design).
 */
async function checkOption(
  page: Page,
  stepId: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(`input[type=checkbox][id="${stepId}_${suffix}-${optionValue}"]`)
    .check();
}

/**
 * Fill the address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 *
 * Addressed by id rather than accessible name: the combobox's label is the
 * generic "Address line 1", which the salon address on `workplace-details` also
 * uses.
 */
export async function fillGeocodedAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.locator(`input[id="${stepId}_address-line-1"]`);
  await combo.click();
  // pressSequentially (not fill) so the debounced autocomplete actually fires.
  await combo.pressSequentially(query, { delay: 20 });

  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(`input[id="${stepId}_address-coordinates"]`);
  await expect(
    coordinates,
    "geocoder did not populate the hidden applicant coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/** Step 1 — the applicant, identical on both branches. */
export async function fillPersonalDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "personal-details");
  await expect(page.locator("h1")).toContainText("Tell us about yourself");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillGeocodedAddress(page, step, data.address);
  // Line 2 is optional here (the recipe overrides required:false), but fill
  // it explicitly rather than rely on whatever line 2 the picked suggestion
  // wrote.
  await fillField(page, step, "address-line-2", data.addressLine2);
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_home-parish"]`),
  ).not.toHaveValue("");
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "phone-number", data.phone);
  await advance(page, step);
}

/** Both required documents, identical on both branches. */
export async function fillDocuments(page: Page): Promise<void> {
  const step = expectStep(page, "documents");
  await expect(page.locator("h1")).toContainText("Add your documents");
  await uploadOne(page, step, "passport-photo", {
    name: "passport-photo.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await uploadOne(page, step, "medical-certificate", {
    name: "medical-certificate.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Confirm and submit");
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

test.describe("Hairdresser Licence Application — Live Smoke", () => {
  test("submits with a known workplace, working at a salon and somewhere else", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillPersonalDetails(page, data);

    // ─── Workplace details — two independent inline reveals ──────────────────
    let step = expectStep(page, "workplace-details");
    await expect(page.locator("h1")).toContainText("where you plan to work");

    const salonName = page.locator(`[id="${step}_salon-name"]`);
    const somewhereElse = page.locator(`[id="${step}_somewhere-else"]`);
    await expect(salonName).toBeHidden();
    await expect(somewhereElse).toBeHidden();

    await checkOption(page, step, "workplace-locations", "at-salon");
    await expect(salonName).toBeVisible({ timeout: STEP_TIMEOUT });
    // "at-salon" reveals the salon block but not the other free-text field.
    await expect(somewhereElse).toBeHidden();

    await checkOption(page, step, "workplace-locations", "somewhere-else");
    await expect(somewhereElse).toBeVisible({ timeout: STEP_TIMEOUT });

    await salonName.fill(data.salonName);
    await fillField(page, step, "salon-address-line-1", data.salonAddressLine1);
    await fillField(page, step, "salon-address-line-2", data.salonAddressLine2);
    await selectDropdown(page, step, "salon-parish", data.salonParish);
    await somewhereElse.fill(data.somewhereElse);
    await advance(page, step);

    await fillDocuments(page);

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.salonName).first()).toBeVisible();
    await expect(page.getByText(data.somewhereElse).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits selecting a workplace option that reveals no extra details (from home)", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillPersonalDetails(page, data);

    // ─── Workplace details — "from-home" alone triggers neither inline reveal ─
    let step = expectStep(page, "workplace-details");
    await expect(page.locator("h1")).toContainText("where you plan to work");

    const salonName = page.locator(`[id="${step}_salon-name"]`);
    const somewhereElse = page.locator(`[id="${step}_somewhere-else"]`);
    await expect(salonName).toBeHidden();
    await expect(somewhereElse).toBeHidden();

    await checkOption(page, step, "workplace-locations", "from-home");
    await expect(salonName).toBeHidden();
    await expect(somewhereElse).toBeHidden();

    await advance(page, step);

    await fillDocuments(page);

    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The salon and "somewhere else" answers were never asked, so they must
    // not appear in the review.
    await expect(page.getByText("What is the name of the salon?")).toHaveCount(
      0,
    );
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
