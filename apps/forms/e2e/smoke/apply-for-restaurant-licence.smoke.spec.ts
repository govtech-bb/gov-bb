/**
 * apply-for-restaurant-licence.smoke.spec.ts
 *
 * STALE — do not run until rewritten. `apply-for-restaurant-licence` now serves
 * the 13-step Environmental Health recipe; the steps and field ids this spec
 * drives (`applicant-details.*`, `restaurant-details.*`, `is-owner-operator`)
 * belong to the 7-step recipe it replaced. No workflow runs this file, so
 * nothing in CI depends on it.
 *
 * Live, on-demand smoke test for the Apply for a restaurant licence service
 * (formId `apply-for-restaurant-licence`) — the ongoing licence, as opposed to
 * the 30-day `apply-for-temporary-restaurant-licence`.
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
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes:
 *  - `is-owner-operator` is the only branch. Answering "no" reveals the owner's
 *    name / phone / optional email inline (fieldConditionalOn, not a separate
 *    step). The two tests below cover both answers.
 *  - The restaurant address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads. We
 *    faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `restaurant-address-coordinates` filled.
 *  - Supporting documents are entirely optional (the paper form lists none), so
 *    the "no" test walks straight past that step to prove it is not a blocker.
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
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-restaurant-licence";

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
 * a suggestion is picked — so the restaurant address is chosen from this pool.
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
    addressLine1: faker.location.streetAddress(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    mobile: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    applicantEmail: "testing@govtech.bb",

    // Timestamped so the resulting submission is easy to find in the target env.
    restaurantName: `Smoke Test Restaurant ${new Date().toISOString()}`,
    restaurantAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),

    ownerName: `${faker.person.firstName()} ${faker.person.lastName()}`,
    ownerPhone: bbMobileNumber(),
    ownerEmail: "testing@govtech.bb",
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
 */
export async function fillGeocodedRestaurantAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.getByRole("combobox", {
    name: "Restaurant address line 1",
  });
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
    `input[id="${stepId}_restaurant-address-coordinates"]`,
  );
  await expect(
    coordinates,
    "geocoder did not populate the hidden restaurant coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/** Steps 1–2, identical on both branches. */
export async function fillTypeAndApplicant(
  page: Page,
  data: ReturnType<typeof buildData>,
  applicationType: "new" | "renewal",
): Promise<void> {
  let step = expectStep(page, "application-type");
  await selectRadio(page, step, "application-type", applicationType);
  await advance(page, step);

  step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-middle-name", data.middleName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "applicant-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "applicant-parish", data.applicantParish);
  await fillField(page, step, "mobile-number", data.mobile);
  await fillField(page, step, "email", data.applicantEmail);
  await advance(page, step);
}

/** Step 4 — the restaurant itself, identical on both branches. */
export async function fillRestaurantDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "restaurant-details");
  await expect(page.locator("h1")).toContainText("About the restaurant");
  await fillField(page, step, "restaurant-name", data.restaurantName);
  await fillGeocodedRestaurantAddress(page, step, data.restaurantAddress);
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_restaurant-parish"]`),
  ).not.toHaveValue("");
  await advance(page, step);
}

test.describe("Apply for a restaurant licence — Live Smoke", () => {
  test("submits as the owner, skipping the optional documents, and reaches the confirmation screen", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillTypeAndApplicant(page, data, "new");

    // ─── Owner / operator — "yes" hides the three contact fields ─────────────
    let step = expectStep(page, "restaurant-owner");
    await expect(
      page.locator(`[id="${step}_owner-operator-name"]`),
    ).toBeHidden();
    await selectRadio(page, step, "is-owner-operator", "yes");
    await expect(
      page.locator(`[id="${step}_owner-operator-name"]`),
    ).toBeHidden();
    await advance(page, step);

    await fillRestaurantDetails(page, data);

    // ─── Supporting documents — entirely optional, so advance untouched ──────
    step = expectStep(page, "documents");
    await expect(page.locator("h1")).toContainText("Supporting documents");
    await advance(page, step);

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.restaurantName).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    // ─── Declaration ────────────────────────────────────────────────────────
    step = expectStep(page, "declaration");
    await page
      .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
      .check();

    await submitAndConfirm(page, {
      heading: "Application submitted",
      referenceLabel: /reference/i,
    });

    // The confirmation copy substitutes {polyclinic} with the catchment the
    // router resolved from the geocoded address. The generic "your local
    // polyclinic" fallback means resolution failed (e.g. a missing per-form
    // programme code in polyclinic-routing.ts), which would also break the
    // polyclinic's copy of the application — so assert a real name.
    await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
    await expect(page.getByText("your local polyclinic")).toHaveCount(0);
  });

  test("submits with a separate owner, revealing the owner contact fields inline", async ({
    page,
  }) => {
    const data = buildData();

    await openForm(page);
    await fillTypeAndApplicant(page, data, "renewal");

    // ─── Owner / operator — "no" reveals name, phone and optional email ──────
    let step = expectStep(page, "restaurant-owner");
    await selectRadio(page, step, "is-owner-operator", "no");
    const ownerName = page.locator(`[id="${step}_owner-operator-name"]`);
    await expect(ownerName).toBeVisible({ timeout: STEP_TIMEOUT });
    await ownerName.fill(data.ownerName);
    await fillField(page, step, "owner-operator-phone", data.ownerPhone);
    await fillField(page, step, "owner-operator-email", data.ownerEmail);
    await advance(page, step);

    await fillRestaurantDetails(page, data);

    // ─── Supporting documents — upload one to exercise the optional field ────
    step = expectStep(page, "documents");
    await uploadOne(page, step, "supporting-documents", {
      name: "premises-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.getByText(data.ownerName).first()).toBeVisible();
    await advance(page, step);

    // ─── Declaration ────────────────────────────────────────────────────────
    step = expectStep(page, "declaration");
    await page
      .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
      .check();

    await submitAndConfirm(page, {
      heading: "Application submitted",
      referenceLabel: /reference/i,
    });
  });
});
