/**
 * apply-for-swimming-pool-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the swimming pool licence service
 * (formId `apply-for-swimming-pool-licence`, programme `SWIMMING_POOL_LICENCE`).
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
 *     --config playwright.smoke.config.ts apply-for-swimming-pool-licence
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
 *  - The journey follows Environmental Health's content review (#2856):
 *    `about-application`, `applying-for`, then `permission` and `your-role`
 *    (only when applying for another person or a business), `your-details`,
 *    `person-details` or `business-details`, `pool-location` (the property),
 *    `pool-details` (repeatable, one instance per pool) and
 *    `supporting-documents`.
 *  - There is no stop page: answering "No" to permission is refused on the
 *    `permission` step itself by a `^yes$` pattern rule (the hotel licence
 *    pattern). Neither walk takes that branch, since it cannot submit.
 *  - `pool-details` is the ONLY repeatable step. Pool 1 is `pool-details`, and
 *    pool 2 is `pool-details~1`; `expectStep` returns the live id, so one
 *    helper fills either. Each instance carries its own `addAnother` radio.
 *    The first walk adds two pools: a pool-to-pool condition bug (#2856 part
 *    A) once made one pool's answers decide what another was asked.
 *  - Applicant name / parish / email / telephone keep their component-default
 *    ids (`first-name`, `parish`, `email`, `telephone`); the webhook maps
 *    applicant phone from `your-details.telephone`, which validates with
 *    libphonenumber-js, so the number needs a real Barbados exchange.
 *  - The PROPERTY address on `pool-location` is the address-lookup (geocoder)
 *    field the catchment routes on (`catchmentRouting.coordinatesField` =
 *    `pool-location.pool-address-coordinates`). It must stay on a plain,
 *    unconditional step: `readPath` returns null for a repeatable or hidden
 *    path, and the MDA email then fails with NO_RECIPIENT. We pick from known
 *    geocodable locations and assert the coordinates and parish filled.
 *  - `supporting-documents` branches on `application-type`: "new" asks for the
 *    Planning and Development site plan plus an optional application number,
 *    "renewal" for the optional Pool Plan.
 *  - The confirmation screen's copy lives in `markdownContent`, with
 *    `{polyclinic}` substituted from the geocoded property address. We assert
 *    a real polyclinic name and that the "your local polyclinic" fallback is
 *    absent, because that fallback means routing failed.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  openSmokeForm,
  advance,
  expectStep,
  fillDate,
  fillField,
  fillGeocodedAddress,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-swimming-pool-licence";

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
 * a suggestion is picked — so the property address is chosen from this pool.
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

type Pool = {
  name: string;
  type: "swimming" | "wading" | "jacuzzi";
  capacity: string;
  unit: "gallons" | "cubic-metres";
  openToPublic: "yes" | "no";
};

/** Build a complete, valid set of answers for any branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));
  // Timestamped so the resulting submission is easy to find in the target env.
  const stamp = new Date().toISOString();

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    // The applicant address is plain text — nothing routes on it.
    applicantAddress: faker.location.streetAddress(),
    addressLine2: faker.location.street(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbMobileNumber(),

    licenceNumber: `SPL-${faker.string.numeric(5)}`,
    role: "Property manager (smoke test)",
    businessName: `Smoke Test Resorts Ltd ${stamp}`,
    businessAddress: faker.location.streetAddress(),
    businessParish: faker.helpers.arrayElement(PARISH_VALUES),
    otherPropertyType: "Residents' club (smoke test)",

    // The PROPERTY address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    propertyAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    propertyAddressLine2: faker.location.street(),

    pools: [
      {
        name: `Smoke Test main pool ${stamp}`,
        type: "swimming",
        capacity: String(faker.number.int({ min: 500, max: 50_000 })),
        unit: "gallons",
        openToPublic: "yes",
      },
      {
        name: `Smoke Test rooftop spa ${stamp}`,
        type: "jacuzzi",
        capacity: String(faker.number.int({ min: 1, max: 20 })),
        unit: "cubic-metres",
        openToPublic: "no",
      },
    ] satisfies Pool[],

    planningApplicationNumber: `PDD/${faker.string.numeric(5)}`,
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

/** New or renewal. A renewal is asked for its current licence number. */
export async function fillAboutApplication(
  page: Page,
  data: Data,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "about-application");
  await expect(page.locator("h1")).toContainText("About your application");
  const licenceNumber = page.locator(`[id="${step}_licence-number"]`);
  await selectRadio(page, step, "application-type", applicationType);
  if (applicationType === "renewal") {
    await expect(licenceNumber).toBeVisible({ timeout: STEP_TIMEOUT });
    await licenceNumber.fill(data.licenceNumber);
  } else {
    await expect(licenceNumber).toBeHidden();
  }
  await advance(page, step);
}

/**
 * Who the application is for. Applying for someone else goes on through
 * permission and role; applying for yourself skips straight to your details.
 */
export async function fillApplyingFor(
  page: Page,
  data: Data,
  applyingFor: "yourself" | "another-person" | "business",
): Promise<void> {
  let step = expectStep(page, "applying-for");
  await selectRadio(page, step, "applying-for", applyingFor);
  await advance(page, step);
  if (applyingFor === "yourself") return;

  step = expectStep(page, "permission");
  await selectRadio(page, step, "has-permission", "yes");
  await advance(page, step);

  step = expectStep(page, "your-role");
  await fillField(page, step, "relationship-to-owner", data.role);
  await advance(page, step);
}

/** The applicant. Name / parish / email / phone keep component-default ids. */
export async function fillYourDetails(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillField(page, step, "telephone", data.phone);
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "your-address-line-1", data.applicantAddress);
  await fillField(page, step, "your-address-line-2", data.addressLine2);
  await selectDropdown(page, step, "parish", data.applicantParish);
  await advance(page, step);
}

/** The business, at an address other than the applicant's. */
export async function fillBusinessDetails(
  page: Page,
  data: Data,
): Promise<void> {
  const step = expectStep(page, "business-details");
  await fillField(page, step, "business-name", data.businessName);
  const line1 = page.locator(`[id="${step}_business-address-line-1"]`);
  await expect(line1).toBeHidden();
  await selectRadio(page, step, "business-same-address", "no");
  await expect(line1).toBeVisible({ timeout: STEP_TIMEOUT });
  await line1.fill(data.businessAddress);
  await selectDropdown(page, step, "business-parish", data.businessParish);
  await advance(page, step);
}

/**
 * The property. Its address is the one the catchment routes on, so the
 * geocoder MUST resolve: the helper asserts the hidden coordinates filled
 * rather than soft-skipping.
 */
export async function fillProperty(
  page: Page,
  data: Data,
  propertyType: "private-home" | "hotel" | "apartment" | "school" | "other",
): Promise<void> {
  const step = expectStep(page, "pool-location");
  await expect(page.locator("h1")).toContainText("Tell us about the property");

  const otherType = page.locator(`[id="${step}_property-type-other"]`);
  await selectRadio(page, step, "property-type", propertyType);
  if (propertyType === "other") {
    await expect(otherType).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherType.fill(data.otherPropertyType);
  } else {
    await expect(otherType).toBeHidden();
  }

  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "pool-address-line-1",
      coordinatesFieldId: "pool-address-coordinates",
    },
    data.propertyAddress,
  );
  // Line 2 is optional and the picked suggestion already wrote something —
  // overwrite it so the submitted record is deterministic.
  await fillField(page, step, "pool-address-line-2", data.propertyAddressLine2);
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_pool-parish"]`),
  ).not.toHaveValue("");
  await advance(page, step);
}

/**
 * One pool — one instance of the repeatable `pool-details` step. Pool 2 runs
 * on `pool-details~1`, which `expectStep` returns as the live id.
 */
export async function fillPool(
  page: Page,
  pool: Pool,
  addAnother: "yes" | "no",
): Promise<void> {
  const step = expectStep(page, "pool-details");
  await expect(page.locator("h1")).toContainText(
    "Tell us about the pools at this property",
  );
  await fillField(page, step, "pool-name", pool.name);
  await selectRadio(page, step, "pool-type", pool.type);
  await fillField(page, step, "pool-water-capacity-number", pool.capacity);
  await selectRadio(page, step, "pool-capacity-unit", pool.unit);
  await selectRadio(page, step, "pool-open-to-public", pool.openToPublic);
  await selectRadio(page, step, "addAnother", addAnother);
  await advance(page, step);
}

/**
 * Planning information and documents, branched on `application-type`. The
 * branch not taken must render nothing — asserted, so a conditional that stops
 * resolving fails here loudly.
 */
export async function fillPlanningDocuments(
  page: Page,
  data: Data,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "supporting-documents");
  await expect(page.locator("h1")).toContainText(
    "Planning information and documents",
  );

  const sitePlan = page.locator(
    `input[type=file][id="${step}_town-country-planning-plan"]`,
  );
  const poolPlan = page.locator(`input[type=file][id="${step}_pool-plan"]`);

  if (applicationType === "new") {
    await expect(poolPlan).toBeHidden();
    await uploadOne(page, step, "town-country-planning-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await fillField(page, step, "town-text", data.planningApplicationNumber);
  } else {
    await expect(sitePlan).toBeHidden();
    await uploadOne(page, step, "pool-plan", {
      name: "pool-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
  }

  await advance(page, step);
}

/** Fill in the agreement and submit for real. */
async function agreeAndSubmit(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Your agreement");
  await fillField(
    page,
    step,
    "declaration-full-name",
    `${data.firstName} ${data.lastName}`,
  );
  const today = new Date();
  await fillDate(
    page,
    step,
    "declaration-date",
    today.getDate(),
    today.getMonth() + 1,
    today.getFullYear(),
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
    page.getByText(
      "We have received your application for a swimming pool licence.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  // `{polyclinic}` is substituted with the catchment resolved from the geocoded
  // property address. The generic "your local polyclinic" fallback means
  // resolution failed, which would also mean the polyclinic never got its copy
  // of the application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.describe("Swimming Pool Licence — Live Smoke", () => {
  test("submits a new licence for yourself with two pools", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, data, "new");
    await fillApplyingFor(page, data, "yourself");
    await fillYourDetails(page, data);
    await fillProperty(page, data, "private-home");
    await fillPool(page, data.pools[0], "yes");
    await fillPool(page, data.pools[1], "no");
    await fillPlanningDocuments(page, data, "new");

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    for (const pool of data.pools)
      await expect(page.getByText(pool.name).first()).toBeVisible();
    // Applying for yourself never reaches the role question.
    await expect(page.getByText(data.role)).toHaveCount(0);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await agreeAndSubmit(page, data);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal for a business at another address", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, data, "renewal");
    await fillApplyingFor(page, data, "business");
    await fillYourDetails(page, data);
    await fillBusinessDetails(page, data);
    await fillProperty(page, data, "other");
    await fillPool(page, data.pools[0], "no");
    await fillPlanningDocuments(page, data, "renewal");

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // Everything the business route revealed made it into the review.
    for (const answer of [
      data.licenceNumber,
      data.role,
      data.businessName,
      data.otherPropertyType,
    ])
      await expect(page.getByText(answer).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await agreeAndSubmit(page, data);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
