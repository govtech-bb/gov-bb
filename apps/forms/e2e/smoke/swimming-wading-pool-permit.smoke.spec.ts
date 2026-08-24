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
 *  - The form has ONE branch left: `owner-type` on `pool-owner-details`. Picking
 *    "manager" reveals `connection-to-pool` inline on the same step; a business
 *    owner never sees it. The two tests below cover both sides.
 *    An earlier shape of this recipe gated three whole steps off that answer
 *    (`authorisation` → `not-authorised-stop` / `pool-connection`). The
 *    form-builder publish in #2407 removed all three, along with the
 *    `home-owner` option, the `permit-year` question and the `private-home`
 *    usage option. The redesign is deliberate — see that PR — so this spec
 *    tracks the published form, not the older shape.
 *  - Four steps carry a `repeatable` behaviour (`about-pool`, `pool-capacity`,
 *    `pool-usage`, `pool-address`). Each renders its own `addAnother` radio,
 *    addressed as `${stepId}_addAnother-{yes,no}`, which must be answered before
 *    the step will advance. Every walk below answers "no" — the single-pool
 *    path. `add-another-pool` is a separate, non-repeatable step that asks the
 *    same thing once more at the end.
 *  - `supporting-documents` renders NOTHING today. Its three uploads are gated
 *    on `about-application.application-type` by a `fieldConditionalOn` that
 *    carries no `targetStepId`, so the client resolves the target against the
 *    upload's own step, misses, and hides all three permanently — while the API
 *    still counts them as required. That is issue #2426, not a fault in this
 *    spec: every pool permit is currently submitted with no documents at all.
 *    We walk the empty step. When #2426 lands, three required uploads appear
 *    here and this spec must gain `uploadOne` calls in the same change.
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
 *  - Picking a suggestion also fills `address-line-2` and `parish`. Line 2 is
 *    optional here (the recipe sets `required: false`), but we overwrite it with
 *    faker data so the submitted record is deterministic; `parish` is asserted
 *    rather than overwritten, since that value is the catchment router's
 *    fallback.
 *  - The applicant phone is `components/mobile-telephone` — `mobile-telephone`,
 *    not `phone-number`. It is what the webhook maps applicant phone from
 *    (`your-details.mobile-telephone`). It validates with libphonenumber-js, so
 *    the number needs a real Barbados exchange. `work-telephone` sits beside it
 *    and is optional; we leave it empty.
 *  - Two inline reveals on the pool steps: `pool-usage-type` including "other"
 *    reveals `pool-usage-description`, and `same-address` = "no" reveals the
 *    three pool address fields. The second test takes both.
 *  - `pool-usage-type` is a CHECKBOX group (multi-select), not a radio — tick
 *    options rather than selecting one.
 *  - The pool address is a plain `components/address`, NOT geocoded — the
 *    catchment is resolved from the applicant's address regardless of where the
 *    pool is. Worth knowing if a pool in another parish is ever meant to route
 *    to that parish's polyclinic.
 *  - Nothing form-specific is asserted on the confirmation screen, because
 *    nothing form-specific reaches it. This recipe's `submission-confirmation`
 *    carries its copy in `nextSteps`, and `hydrateStep`
 *    (apps/api/src/registry/resolution.ts) deliberately does NOT carry
 *    `nextSteps` into the served contract — it is dormant across every recipe.
 *    The screen renders the heading and the reference code, nothing else.
 *    Don't assert the "Environmental Health" copy or a /Polyclinic/ placeholder
 *    here; neither can ever render. Catchment routing still runs — it drives
 *    the MDA email — it just isn't surfaced to the applicant. To surface it,
 *    the copy has to move to `markdownContent`, which IS hydrated.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  tickCheckbox,
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

    chemicalsUsed: "Chlorine and pH buffer, dosed weekly (smoke test)",
    phLevel: "7.4",
    maintenanceActions: "Filter serviced and tiles regrouted (smoke test)",
    safetyEquipment: "Life rings, first aid kit, reaching pole (smoke test)",
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
 * generic "Address line 1", which the pool address on a later step shares.
 */
async function fillGeocodedAddress(
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

/** Step 1 — application type. */
export async function fillAboutApplication(
  page: Page,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "about-application");
  await expect(page.locator("h1")).toContainText("About your application");
  await selectRadio(page, step, "application-type", applicationType);
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
  // Line 2 is optional and the picked suggestion already wrote something —
  // overwrite it so the submitted record is deterministic.
  await fillField(page, step, "address-line-2", data.addressLine2);
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(page.locator(`select[id="${step}_parish"]`)).not.toHaveValue("");
  await fillField(page, step, "email", data.email);
  // `mobile-telephone`, not `phone-number` — this is what the webhook maps
  // applicant phone from. `work-telephone` beside it is optional; left empty.
  await fillField(page, step, "mobile-telephone", data.phone);
  await advance(page, step);
}

/**
 * Step 3 — connection to the pool. "manager" reveals `connection-to-pool`
 * inline on this same step; a business owner never sees it.
 */
export async function fillPoolOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  ownerType: "business-owner" | "manager",
): Promise<void> {
  const step = expectStep(page, "pool-owner-details");
  await expect(page.locator("h1")).toContainText("Your connection to the pool");
  const connection = page.locator(`[id="${step}_connection-to-pool"]`);
  await expect(connection).toBeHidden();
  await selectRadio(page, step, "owner-type", ownerType);
  if (ownerType === "manager") {
    await expect(connection).toBeVisible({ timeout: STEP_TIMEOUT });
    await connection.fill(data.connectionToPool);
  } else {
    // The gate's whole purpose: an owner is not asked how they are connected.
    await expect(connection).toBeHidden();
  }
  await advance(page, step);
}

/**
 * Steps 4–7 — the pool itself, identical on every route. All four steps are
 * `repeatable`, so each one also carries an `addAnother` radio that must be
 * answered before it will advance; we always take the single-pool path.
 */
export async function fillPoolDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  poolType: "swimming" | "wading",
  usageType:
    | "hotel"
    | "apartment"
    | "public"
    | "condo-home"
    | "school"
    | "other",
): Promise<void> {
  let step = expectStep(page, "about-pool");
  await expect(page.locator("h1")).toContainText("About the pool");
  await selectRadio(page, step, "pool-type", poolType);
  await fillField(page, step, "pool-name", data.poolName);
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);

  step = expectStep(page, "pool-capacity");
  await expect(page.locator("h1")).toContainText("water can the pool hold");
  await fillField(page, step, "water-capacity", data.waterCapacity);
  await selectDropdown(page, step, "capacity-unit", "gallons");
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);

  // ─── Usage — a checkbox group; "other" reveals the free-text description ───
  step = expectStep(page, "pool-usage");
  await expect(page.locator("h1")).toContainText("How is the pool mainly used");
  const description = page.locator(`[id="${step}_pool-usage-description"]`);
  await expect(description).toBeHidden();
  await tickCheckbox(page, step, "pool-usage-type", usageType);
  if (usageType === "other") {
    await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
    await description.fill(data.poolUsageDescription);
  } else {
    await expect(description).toBeHidden();
  }
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);
}

/**
 * Step 7 — pool address. "no" reveals the three address fields inline. Also
 * repeatable, so it carries its own `addAnother`.
 */
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
  await selectRadio(page, step, "addAnother", "no");
  await advance(page, step);
}

/** Steps 8–9 — facilities, then chemical maintenance and safety. */
export async function fillPoolMaintenance(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  let step = expectStep(page, "pool-facilities");
  await expect(page.locator("h1")).toContainText(
    "Pool facilities and maintenance",
  );
  await tickCheckbox(page, step, "pool-facilities", "lighting");
  await tickCheckbox(page, step, "pool-facilities", "shower-facilities");
  await selectRadio(page, step, "records-up-to-date", "yes");
  await advance(page, step);

  step = expectStep(page, "pool-chemical-maintenance");
  await expect(page.locator("h1")).toContainText(
    "Chemical maintenance and safety",
  );
  await fillField(page, step, "chemicals-used", data.chemicalsUsed);
  await fillField(page, step, "ph-level", data.phLevel);
  await fillDate(page, step, "last-cleaning-date", 10, 8, 2026);
  await fillField(page, step, "maintenance-actions", data.maintenanceActions);
  await fillField(page, step, "safety-equipment", data.safetyEquipment);
  await advance(page, step);
}

/**
 * Steps 10–11 — the final "add another pool?" question, then the supporting
 * documents step, which renders nothing at all today (issue #2426 — see the
 * header note). Both are walked, neither branches.
 */
export async function fillFinalSteps(page: Page): Promise<void> {
  let step = expectStep(page, "add-another-pool");
  await expect(page.locator("h1")).toContainText("add another pool");
  await selectRadio(page, step, "add-another-pool", "no");
  await advance(page, step);

  step = expectStep(page, "supporting-documents");
  await expect(page.locator("h1")).toContainText("Supporting documents");
  // Asserted, not skipped: the moment #2426 lands, three required uploads
  // appear here and this expectation fails loudly instead of the step
  // silently blocking.
  await expect(
    page.locator(`main input[type="file"]`),
    "supporting-documents rendered an upload — #2426 has landed, add uploadOne calls here",
  ).toHaveCount(0);
  await advance(page, step);
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Declaration");
  await page
    .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
    .check();

  // Heading + reference code is the whole of this recipe's confirmation
  // screen — see the header note on why there is no copy to assert.
  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });
}

test.describe("Swimming & Wading Pool Permit — Live Smoke", () => {
  test("submits a new permit as a business owner, never asked how they are connected", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, "new");
    await fillYourDetails(page, data);
    await fillPoolOwnerDetails(page, data, "business-owner");
    await fillPoolDetails(page, data, "swimming", "hotel");
    await fillPoolAddress(page, data, "yes");
    await fillPoolMaintenance(page, data);
    await fillFinalSteps(page);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.poolName).first()).toBeVisible();
    // An owner was never asked the connection question, so it cannot appear.
    await expect(page.getByText(data.connectionToPool)).toHaveCount(0);
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal as a manager, with a separate pool address", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, "renewal");
    await fillYourDetails(page, data);
    // "manager" reveals the connection question inline.
    await fillPoolOwnerDetails(page, data, "manager");
    await fillPoolDetails(page, data, "wading", "other");
    await fillPoolAddress(page, data, "no");
    await fillPoolMaintenance(page, data);
    await fillFinalSteps(page);

    const step = expectStep(page, "check-your-answers");
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
});
