/**
 * swimming-wading-pool-permit.smoke.spec.ts
 *
 * Live, on-demand smoke test for the swimming / wading pool permit service
 * (formId `swimming-wading-pool-permit`, programme `SWIMMING_POOL_PERMIT`).
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
 *     --config playwright.smoke.config.ts swimming-wading-pool-permit
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
 *  - This is the most branched of the three Environmental Health forms. Three
 *    steps are gated by stepConditionalOn, chained off `owner-type`:
 *      • `authorisation`       — only when owner-type = "manager"
 *      • `not-authorised-stop` — only when is-authorised = "no"
 *      • `pool-connection`     — only when is-authorised = "yes"
 *    A home or business owner therefore sees none of the three. The three tests
 *    below cover all three routes through that chain.
 *  - `not-authorised-stop` is a title-only page: its single element
 *    (`stop-message`) is `isHidden: true` with empty validations, a placeholder
 *    so the step renders nothing but its heading. Note that every step AFTER it
 *    (`about-pool` onward) is unconditional, so it warns rather than hard-stops
 *    — an unauthorised manager can still continue. The third test asserts the
 *    warning is reached and deliberately does NOT submit; if a hard stop is
 *    intended, the later steps need gating too and that test should tighten.
 *  - Applicant name / parish / email carry no `fieldId` override in the recipe,
 *    so they keep their component defaults (`first-name`, `parish`, `email`) —
 *    which is also what `catchmentRouting.parishField` (`your-details.parish`)
 *    refers to.
 *  - The applicant address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` = `your-details.address-coordinates`).
 *    We faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `address-coordinates` filled.
 *  - `address-line-2` is `components/address` and the recipe does NOT set
 *    `validations.required.value: false`, so it inherits required + minLength 5
 *    and blocks the step. We fill it explicitly after the geocode.
 *  - `phone-number` is `components/contact-telephone`, which validates with
 *    libphonenumber-js, so the number needs a real Barbados exchange.
 *  - Two inline reveals: `pool-usage-type` = "other" reveals
 *    `pool-usage-description`, and `same-address` = "no" reveals the three pool
 *    address fields. The second test takes both.
 *  - The pool address is a plain `components/address`, NOT geocoded — the
 *    catchment is resolved from the applicant's address regardless of where the
 *    pool is. Worth knowing if a pool in another parish is ever meant to route
 *    to that parish's polyclinic.
 *  - UNLIKE hotel-licence-application, this recipe's confirmation step uses
 *    generic `nextSteps` copy and no `{polyclinic}` placeholder, so there is no
 *    resolved-catchment name on the confirmation screen to assert. Catchment
 *    routing still runs (it drives the MDA email), it just isn't surfaced to
 *    the applicant. Don't add a /Polyclinic/ assertion here; it would fail.
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
} from "../helpers/smoke";

export const FORM_ID = "swimming-wading-pool-permit";

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

/** Build a complete, valid set of answers for any branch. */
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

    connectionToPool: "Property manager for the owner (smoke test)",

    // Timestamped so the resulting submission is easy to find in the target env.
    poolName: `Smoke Test Pool ${new Date().toISOString()}`,
    waterCapacity: String(faker.number.int({ min: 500, max: 50_000 })),
    poolUsageDescription:
      "Shared pool for a residents' association (smoke test)",

    poolAddressLine1: faker.location.streetAddress(),
    poolAddressLine2: faker.location.street(),
    poolParish: faker.helpers.arrayElement(PARISH_VALUES),
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
 * generic "Address line 1", which the pool address on `pool-address` also uses.
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

/** Step 1 — application type and permit year. */
export async function fillAboutApplication(
  page: Page,
  applicationType: "new" | "renewal",
  permitYear: "2026" | "2027",
): Promise<void> {
  const step = expectStep(page, "about-application");
  await expect(page.locator("h1")).toContainText("About your application");
  await selectRadio(page, step, "application-type", applicationType);
  await selectDropdown(page, step, "permit-year", permitYear);
  await advance(page, step);
}

/** Step 2 — the applicant. Name / parish / email keep component-default ids. */
export async function fillYourDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillGeocodedAddress(page, step, data.address);
  // Line 2 inherits components/address's required + minLength 5 (the recipe
  // never sets required:false), so fill it rather than rely on whatever the
  // picked suggestion wrote.
  await fillField(page, step, "address-line-2", data.addressLine2);
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(page.locator(`select[id="${step}_parish"]`)).not.toHaveValue("");
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "phone-number", data.phone);
  await advance(page, step);
}

/** Steps 7–9 — the pool itself, identical on every route that reaches them. */
export async function fillPoolDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  poolType: "swimming" | "wading",
  usageType: "private-home" | "hotel" | "apartment" | "public" | "other",
): Promise<void> {
  let step = expectStep(page, "about-pool");
  await expect(page.locator("h1")).toContainText("About the pool");
  await selectRadio(page, step, "pool-type", poolType);
  await fillField(page, step, "pool-name", data.poolName);
  await advance(page, step);

  step = expectStep(page, "pool-capacity");
  await expect(page.locator("h1")).toContainText("water can the pool hold");
  await fillField(page, step, "water-capacity", data.waterCapacity);
  await selectDropdown(page, step, "capacity-unit", "gallons");
  await advance(page, step);

  // ─── Usage — "other" reveals the free-text description inline ──────────────
  step = expectStep(page, "pool-usage");
  await expect(page.locator("h1")).toContainText("How is the pool mainly used");
  const description = page.locator(`[id="${step}_pool-usage-description"]`);
  await expect(description).toBeHidden();
  await selectRadio(page, step, "pool-usage-type", usageType);
  if (usageType === "other") {
    await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
    await description.fill(data.poolUsageDescription);
  } else {
    await expect(description).toBeHidden();
  }
  await advance(page, step);
}

/** Step 10 — pool address. "no" reveals the three address fields inline. */
export async function fillPoolAddress(
  page: Page,
  data: ReturnType<typeof buildData>,
  sameAddress: "yes" | "no",
): Promise<void> {
  const step = expectStep(page, "pool-address");
  await expect(page.locator("h1")).toContainText("Pool address");
  const line1 = page.locator(`[id="${step}_pool-address-line-1"]`);
  await expect(line1).toBeHidden();
  await selectRadio(page, step, "same-address", sameAddress);
  if (sameAddress === "no") {
    await expect(line1).toBeVisible({ timeout: STEP_TIMEOUT });
    await line1.fill(data.poolAddressLine1);
    await fillField(page, step, "pool-address-line-2", data.poolAddressLine2);
    await selectDropdown(page, step, "pool-parish", data.poolParish);
  } else {
    await expect(line1).toBeHidden();
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

  // No {polyclinic} placeholder on this recipe's confirmation step — assert the
  // Environmental Health nextSteps copy instead. See the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
}

test.describe("Swimming & Wading Pool Permit — Live Smoke", () => {
  test("submits a new permit as a home owner, skipping the authorisation chain", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, "new", "2026");
    await fillYourDetails(page, data);

    // ─── Owner type — anything but "manager" skips authorisation entirely ────
    let step = expectStep(page, "pool-owner-type");
    await expect(page.locator("h1")).toContainText("Which best describes you");
    await selectRadio(page, step, "owner-type", "home-owner");
    await advance(page, step);

    // The gate's whole purpose: a home owner is not asked to prove authority,
    // so neither the authorisation question nor the connection follow-up
    // appears.
    expect(
      currentStep(page),
      "a home owner must skip the authorisation step",
    ).not.toContain("authorisation");

    await fillPoolDetails(page, data, "swimming", "private-home");
    await fillPoolAddress(page, data, "yes");

    // ─── Check your answers ─────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.poolName).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal as an authorised manager, with a separate pool address", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, "renewal", "2027");
    await fillYourDetails(page, data);

    // ─── Owner type — "manager" opens the authorisation question ─────────────
    let step = expectStep(page, "pool-owner-type");
    await selectRadio(page, step, "owner-type", "manager");
    await advance(page, step);

    step = expectStep(page, "authorisation");
    await expect(page.locator("h1")).toContainText("authorised to apply");
    await selectRadio(page, step, "is-authorised", "yes");
    await advance(page, step);

    // ─── "yes" routes to the connection question, not the stop page ──────────
    step = expectStep(page, "pool-connection");
    await expect(page.locator("h1")).toContainText("connected to the pool");
    await fillField(page, step, "connection-to-pool", data.connectionToPool);
    await advance(page, step);

    await fillPoolDetails(page, data, "wading", "other");
    await fillPoolAddress(page, data, "no");

    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Everything the manager route revealed made it into the review.
    await expect(page.getByText(data.connectionToPool).first()).toBeVisible();
    await expect(
      page.getByText(data.poolUsageDescription).first(),
    ).toBeVisible();
    await expect(page.getByText(data.poolAddressLine1).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  /**
   * The unauthorised-manager route. This test submits NOTHING — it exists to
   * prove the warning page is reachable and that the connection question is
   * skipped. See the header note: because the steps after `not-authorised-stop`
   * are unconditional, this is a warning rather than a hard stop, so there is
   * no "cannot continue" state to assert yet.
   */
  test("routes an unauthorised manager to the stop page", async ({ page }) => {
    const data = buildData();

    await openForm(page);
    await fillAboutApplication(page, "new", "2026");
    await fillYourDetails(page, data);

    let step = expectStep(page, "pool-owner-type");
    await selectRadio(page, step, "owner-type", "manager");
    await advance(page, step);

    step = expectStep(page, "authorisation");
    await selectRadio(page, step, "is-authorised", "no");
    await advance(page, step);

    step = expectStep(page, "not-authorised-stop");
    await expect(page.locator("h1")).toContainText(
      "You need to be authorised to apply",
    );
    // "no" must route here rather than to the connection follow-up.
    expect(
      step,
      "an unauthorised manager must not reach the pool-connection step",
    ).not.toContain("pool-connection");

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
