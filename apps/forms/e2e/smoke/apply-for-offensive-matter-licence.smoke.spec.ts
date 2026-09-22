/**
 * apply-for-offensive-matter-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the offensive matter carriage licence service
 * (formId `apply-for-offensive-matter-licence`, titled "Apply for a licence to
 * carry offensive matter").
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
 *     --config playwright.smoke.config.ts apply-for-offensive-matter-licence
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
 *  - Four authored steps: `personal-and-contact-details`, `application-type`,
 *    `business-address-details` and `vehicle-details`, then the platform's
 *    `check-your-answers` / `declaration` / `submission-confirmation`. This is
 *    the shortest of the Environmental Health licences — there are no uploads
 *    and no conditional steps, only one conditional FIELD.
 *  - `applicant-telephone` is a `fieldArray` (min 1, max 3), not a plain field.
 *    Row 0 keeps the unsuffixed id (`…_applicant-telephone`); rows 1+ are
 *    index-suffixed (`…_applicant-telephone-1`), and a row is added by clicking
 *    the "Add Another Telephone number" button. The first test leaves it at one
 *    row; the second adds a second number and asserts BOTH reach the review, so
 *    a regression that drops the extra rows fails here. Same shape as the
 *    `telephone` fieldArray on request-an-environmental-health-officer.
 *  - `vehicle-details` is a repeatable step (min 1, max 20) with no
 *    sharedFields, so the base step IS vehicle 1 and carries the injected
 *    `addAnother` radio. Vehicle 2 lands on `vehicle-details~1`. The step sets
 *    `instanceLabel: "Vehicle"`, so instance 2's heading reads "Vehicle 2" —
 *    match the h1 loosely rather than exactly.
 *  - The ONE conditional is `current-licence` on `application-type`, revealed by
 *    `application-type` = "renew". Note the option value is **"renew"**, not
 *    "renewal" as on the sibling offensive-waste recipe — the two forms differ.
 *  - The business address on `business-address-details` is the address-lookup
 *    (geocoder) field, so it cannot take a free-text faker address: the
 *    geocoder must return a real Barbados match to populate the hidden
 *    coordinates the catchment router reads (`catchmentRouting.coordinatesField`
 *    = `business-address-details.business-address-coordinates`). We faker-pick
 *    from a pool of known-geocodable locations, select the first suggestion,
 *    then assert the coordinates filled. That field renders as an
 *    `input[type=hidden]`, so assert its VALUE — never its visibility.
 *  - Picking a suggestion fills `business-parish`, and SOMETIMES
 *    `business-address-line-2` (Holetown resolves with it empty). Line 2 is
 *    optional, so we overwrite it with faker data for a deterministic record;
 *    `business-parish` is asserted rather than overwritten, since that value is
 *    the catchment router's fallback (`catchmentRouting.parishField`).
 *  - The business NAME field kept its un-overridden default field id, so it is
 *    addressed as `generic-text` — not `business-name`. Its label is
 *    "Business Name".
 *  - The applicant address on `personal-and-contact-details` is a plain
 *    `components/address` — free-text faker data is fine, nothing routes on it.
 *  - `applicant-telephone` is `components/telephone`, which validates with
 *    libphonenumber-js, so every row needs a real Barbados exchange — a random
 *    `246 NNN NNNN` is rejected.
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    placeholder, substituted with the catchment resolved from the geocoded
 *    BUSINESS address. We assert the resolved Environmental Health copy rather
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
} from "../helpers/smoke";

export const FORM_ID = "apply-for-offensive-matter-licence";

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
 * a suggestion is picked — so the BUSINESS address is chosen from this pool.
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

/**
 * A Barbados vehicle registration mark. Free text in the recipe — no format
 * validation — but shaped realistically so a real run reads plausibly to the
 * MDA, and made unique so it is findable in the target environment.
 */
function vehicleRegistration(): string {
  return `${faker.helpers.arrayElement(["M", "H", "L", "ZR"])}${faker.string.numeric(5)}`;
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
    // Two distinct numbers so the fieldArray's second row is provably its own
    // value on the review, not a duplicate of the first.
    phone: bbPhoneNumber(),
    secondPhone: bbPhoneNumber(),

    currentLicence: `OM/${faker.string.numeric(5)}`,

    // Timestamped so the resulting submission is easy to find in the target env.
    businessName: `Smoke Test Carrier ${new Date().toISOString()}`,
    // The BUSINESS address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    businessAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    businessAddressLine2: faker.location.street(),

    firstVehicle: vehicleRegistration(),
    secondVehicle: vehicleRegistration(),
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
 * Step 1 — the applicant. `applicant-telephone` is a fieldArray: row 0 keeps
 * the unsuffixed id, and `secondPhone` (when given) clicks "Add Another
 * Telephone number" and fills the `-1` row.
 */
export async function fillPersonalAndContactDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  opts: { secondPhone?: boolean } = {},
): Promise<void> {
  const step = expectStep(page, "personal-and-contact-details");
  await expect(page.locator("h1")).toContainText("Tell us about yourself");

  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-middle-name", data.middleName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(
    page,
    step,
    "applicant-address-line-1",
    data.applicantAddress,
  );
  await fillField(
    page,
    step,
    "applicant-address-line-2",
    data.applicantAddressLine2,
  );
  await selectDropdown(page, step, "applicant-parish", data.applicantParish);
  await fillField(page, step, "applicant-email", data.email);

  // fieldArray row 0 keeps the unsuffixed id — see the header note.
  await fillField(page, step, "applicant-telephone", data.phone);
  if (opts.secondPhone) {
    const secondRow = page.locator(`[id="${step}_applicant-telephone-1"]`);
    await expect(secondRow).toHaveCount(0);
    await page
      .getByRole("button", { name: "Add Another Telephone number" })
      .click();
    await expect(secondRow).toBeVisible({ timeout: STEP_TIMEOUT });
    await secondRow.fill(data.secondPhone);
  }

  await advance(page, step);
}

/**
 * Step 2 — new or renew. The ONLY conditional field on the form:
 * `current-licence` is revealed by "renew". Note the value is "renew", not
 * "renewal" — the sibling offensive-waste recipe uses the other spelling.
 */
export async function fillApplicationType(
  page: Page,
  data: ReturnType<typeof buildData>,
  applicationType: "new" | "renew",
): Promise<void> {
  const step = expectStep(page, "application-type");
  await expect(page.locator("h1")).toContainText("Application type");

  const currentLicence = page.locator(`[id="${step}_current-licence"]`);
  await expect(currentLicence).toBeHidden();

  await selectRadio(page, step, "application-type", applicationType);

  if (applicationType === "renew") {
    await expect(currentLicence).toBeVisible({ timeout: STEP_TIMEOUT });
    await currentLicence.fill(data.currentLicence);
  } else {
    // The gate's whole purpose: a first-time applicant has no licence number.
    await expect(currentLicence).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 3 — the business address. This is the step the catchment routes on, so
 * the geocoder MUST resolve: the helper asserts the hidden coordinates filled
 * rather than soft-skipping, because an empty one means the submission reaches
 * no polyclinic at all.
 */
export async function fillBusinessAddressDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<string> {
  const step = expectStep(page, "business-address-details");
  await expect(page.locator("h1")).toContainText("Your business address");

  // The business NAME kept its default field id — `generic-text`, not
  // `business-name`. See the header note.
  await fillField(page, step, "generic-text", data.businessName);

  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "business-address-line-1",
      coordinatesFieldId: "business-address-coordinates",
    },
    data.businessAddress,
  );
  // Line 2 is optional and a suggestion does not always carry one (Holetown
  // resolves with it empty) — overwrite so the submitted record is deterministic.
  await fillField(
    page,
    step,
    "business-address-line-2",
    data.businessAddressLine2,
  );
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_business-parish"]`),
  ).not.toHaveValue("");

  await advance(page, step);
  return coordinates;
}

/**
 * Step 4 — one instance of the repeatable vehicle step.
 *
 * `stepId` is passed in rather than derived, because vehicle 2 lives on
 * `vehicle-details~1`. The heading carries the step's `instanceLabel`, so
 * instance 2 reads "Vehicle 2" — matched loosely.
 */
export async function fillVehicleDetails(
  page: Page,
  stepId: string,
  registration: string,
  addAnother: "yes" | "no",
): Promise<void> {
  await expect(page.locator("h1")).toContainText("Vehicle");
  await fillField(page, stepId, "vehicle-registration-number", registration);
  await selectRadio(page, stepId, "addAnother", addAnother);
  await advance(page, stepId);
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
  // business address. The generic "your local polyclinic" fallback means
  // resolution failed, which would also mean the polyclinic never got its copy
  // of the application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.describe("Offensive Matter Carriage Licence — Live Smoke", () => {
  test("submits a new licence for one vehicle on one telephone number", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillPersonalAndContactDetails(page, data);
    // "new" — the licence number stays hidden.
    await fillApplicationType(page, data, "new");
    const coordinates = await fillBusinessAddressDetails(page, data);

    const vehicleStep = expectStep(page, "vehicle-details");
    await fillVehicleDetails(page, vehicleStep, data.firstVehicle, "no");

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.businessName).first()).toBeVisible();
    await expect(page.getByText(data.firstVehicle).first()).toBeVisible();
    // A first-time applicant was never asked for a licence number.
    await expect(page.getByText(data.currentLicence)).toHaveCount(0);
    // Only one vehicle was added, so the second must be nowhere on the review.
    await expect(page.getByText(data.secondVehicle)).toHaveCount(0);
    // The coordinate the catchment routes on was resolved from the BUSINESS
    // address. Logged so a real run can be traced to a polyclinic.
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] business coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal for two vehicles with a second telephone number", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    // A second fieldArray row — both numbers must survive to the review.
    await fillPersonalAndContactDetails(page, data, { secondPhone: true });
    await fillApplicationType(page, data, "renew");
    const coordinates = await fillBusinessAddressDetails(page, data);

    // ─── Vehicles — "yes" to addAnother materialises a second instance ──────
    const firstVehicleStep = expectStep(page, "vehicle-details");
    await fillVehicleDetails(page, firstVehicleStep, data.firstVehicle, "yes");

    const secondVehicleStep = expectStep(page, "vehicle-details");
    expect(
      secondVehicleStep,
      "answering yes to addAnother must open a new vehicle instance",
    ).not.toBe(firstVehicleStep);
    await fillVehicleDetails(page, secondVehicleStep, data.secondVehicle, "no");

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.currentLicence).first()).toBeVisible();
    // Both fieldArray rows and both repeat instances reached the review.
    await expect(page.getByText(data.phone).first()).toBeVisible();
    await expect(page.getByText(data.secondPhone).first()).toBeVisible();
    await expect(page.getByText(data.firstVehicle).first()).toBeVisible();
    await expect(page.getByText(data.secondVehicle).first()).toBeVisible();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] business coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
