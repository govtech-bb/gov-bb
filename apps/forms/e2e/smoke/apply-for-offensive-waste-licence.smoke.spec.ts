/**
 * apply-for-offensive-waste-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the offensive trade licence service
 * (formId `apply-for-offensive-waste-licence`, titled "Apply for a offensive
 * trade licence with Environmental Health").
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
 *     --config playwright.smoke.config.ts apply-for-offensive-waste-licence
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
 *  - Authored steps: `your-details`, `application-type`, `renewal-details`
 *    (conditional), `work-address`, `business-activities` and `building-plans`
 *    (conditional), then the platform's `check-your-answers` / `declaration` /
 *    `submission-confirmation`.
 *  - `your-details` keeps the component-default field ids (`first-name`,
 *    `parish`, `email`, …) except for the two address lines
 *    (`address-line-1` / `address-line-2`) and the phone, which is a
 *    `components/generic-tel` overridden to `telephone-number`. It validates
 *    with libphonenumber-js, so the number needs a real Barbados exchange — a
 *    random `246 NNN NNNN` is rejected.
 *  - The applicant address on `your-details` is a plain `components/address` —
 *    free-text faker data is fine, nothing routes on it.
 *  - `renewal-details` is a `stepConditionalOn` step, shown only when
 *    `application-type` = "renewal". Inside it, note the polarity:
 *    `building-changes` is revealed by `address-changed` = **"no"**, so an
 *    applicant whose work address HAS changed is never asked about building
 *    work. `building-changes` = "yes" then reveals the free-text description,
 *    which kept its un-overridden default field id `generic-text`.
 *  - The work address on `work-address` is the address-lookup (geocoder) field,
 *    so it cannot take a free-text faker address: the geocoder must return a
 *    real Barbados match to populate the hidden coordinates the catchment
 *    router reads (`catchmentRouting.coordinatesField` =
 *    `work-address.business-address-coordinates`). We faker-pick from a pool of
 *    known-geocodable locations, select the first suggestion, then assert the
 *    coordinates filled. That field renders as an `input[type=hidden]`, so
 *    assert its VALUE — never its visibility.
 *  - Picking a suggestion fills `work-address-parish`, and SOMETIMES
 *    `work-address-line-2` (e.g. "Speightstown" resolves with an empty line 2).
 *    Line 2 is optional, so we overwrite it with faker data for a deterministic
 *    record; `work-address-parish` is asserted rather than overwritten, since
 *    that value is the catchment router's fallback
 *    (`catchmentRouting.parishField`).
 *  - `business-activities` is a required CHECKBOX group of the twelve scheduled
 *    offensive trades — tick options, never select one.
 *
 *  - ⚠ `building-plans` CANNOT CURRENTLY RENDER, and both tests assert that.
 *    The step carries TWO `stepConditionalOn` behaviours:
 *        application-type          == "new"
 *        renewal-details.building-changes == "yes"
 *    and `evaluateFormConditions` (packages/form-conditions/src/index.ts) ANDs
 *    them with `.every(...)`. The two can never both hold: `building-changes`
 *    only exists on `renewal-details`, which is itself hidden unless
 *    `application-type` = "renewal". So a NEW application fails the second
 *    condition (the field is unanswered) and a RENEWAL fails the first.
 *    Verified on the live sandbox: both branches walk straight from
 *    `business-activities` to `check-your-answers`, and the "Plans and details
 *    for the building" upload is never asked for.
 *    The author plainly wanted OR ("new licence, or a renewal with building
 *    work"), which the platform does not express as two step behaviours. The
 *    assertions below pin the CURRENT behaviour deliberately, so that fixing
 *    the recipe fails this spec loudly and forces the walk to be extended,
 *    rather than the upload silently reappearing untested.
 *
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    placeholder, substituted with the catchment resolved from the geocoded
 *    WORK address. We assert the resolved Environmental Health copy rather than
 *    a specific polyclinic name — which polyclinic depends on the address faker
 *    picked — and assert the generic "your local polyclinic" fallback is
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
} from "../helpers/smoke";

export const FORM_ID = "apply-for-offensive-waste-licence";

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
 * a suggestion is picked — so the WORK address is chosen from this pool.
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

/** The twelve scheduled offensive trades on `business-activities`. */
type BusinessActivity =
  | "blood-offal-boiling"
  | "bone-boiling-crushing"
  | "fellmongering"
  | "gut-scraping"
  | "gut-spinning"
  | "slaughtering"
  | "tallow-melting"
  | "tanning"
  | "chemicals-acids"
  | "glue"
  | "manure-manufacturing"
  | "soap-boiling";

function bbPhoneNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
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

    currentLicenceNumber: `OT/${faker.string.numeric(5)}`,
    buildingChanges:
      "Added a bunded washdown bay and a new grease trap (smoke test)",

    // Timestamped so the resulting submission is easy to find in the target env.
    businessName: `Smoke Test Offensive Trade ${new Date().toISOString()}`,
    // The WORK address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    workAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    workAddressLine2: faker.location.street(),
  };
}

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/** Step 1 — the applicant. Mostly component-default field ids. */
export async function fillYourDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("About you");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillField(page, step, "address-line-1", data.applicantAddress);
  await fillField(page, step, "address-line-2", data.applicantAddressLine2);
  await selectDropdown(page, step, "parish", data.applicantParish);
  await fillField(page, step, "email", data.email);
  // `telephone-number`, not `generic-tel` — the recipe overrides the id.
  // Validates with libphonenumber-js, so the exchange has to be a real one.
  await fillField(page, step, "telephone-number", data.phone);
  await advance(page, step);
}

/** Step 2 — new or renewal. Gates the whole `renewal-details` step. */
export async function fillApplicationType(
  page: Page,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "application-type");
  await expect(page.locator("h1")).toContainText("Your application");
  await selectRadio(page, step, "application-type", applicationType);
  await advance(page, step);
}

/**
 * Step 3 — renewal only. Note the polarity of the inner reveal:
 * `building-changes` appears when `address-changed` = **"no"**, so an applicant
 * whose address HAS changed is never asked about building work. Answering "yes"
 * to `building-changes` reveals the description, whose field id is the
 * un-overridden default `generic-text`.
 */
export async function fillRenewalDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  branch: {
    addressChanged: "yes" | "no";
    buildingChanges?: "yes" | "no";
  },
): Promise<void> {
  const step = expectStep(page, "renewal-details");
  await expect(page.locator("h1")).toContainText("Renewal details");

  await fillField(
    page,
    step,
    "current-licence-number",
    data.currentLicenceNumber,
  );

  const buildingChanges = page.locator(
    `fieldset[id="${step}_building-changes"]`,
  );
  const description = page.locator(`[id="${step}_generic-text"]`);

  await expect(buildingChanges).toBeHidden();
  await selectRadio(page, step, "address-changed", branch.addressChanged);

  if (branch.addressChanged === "no") {
    await expect(buildingChanges).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(description).toBeHidden();
    const changed = branch.buildingChanges ?? "no";
    await selectRadio(page, step, "building-changes", changed);
    if (changed === "yes") {
      await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
      await description.fill(data.buildingChanges);
    } else {
      await expect(description).toBeHidden();
    }
  } else {
    // A moved business is never asked about building work — which is also why
    // `building-plans` can never be reached on this branch. See the header.
    await expect(buildingChanges).toBeHidden();
    await expect(description).toBeHidden();
  }

  await advance(page, step);
}

/**
 * Step 4 — where the work is done. This is the step the catchment routes on, so
 * the geocoder MUST resolve: the helper asserts the hidden coordinates filled
 * rather than soft-skipping, because an empty one means the submission reaches
 * no polyclinic at all.
 */
export async function fillWorkAddress(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<string> {
  const step = expectStep(page, "work-address");
  await expect(page.locator("h1")).toContainText("Where you will do the work");

  await fillField(page, step, "business-name", data.businessName);
  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "work-address-line-1",
      coordinatesFieldId: "business-address-coordinates",
    },
    data.workAddress,
  );
  // Line 2 is optional and a suggestion does not always carry one (Speightstown
  // resolves with it empty) — overwrite so the submitted record is deterministic.
  await fillField(page, step, "work-address-line-2", data.workAddressLine2);
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_work-address-parish"]`),
  ).not.toHaveValue("");

  await advance(page, step);
  return coordinates;
}

/** Step 5 — the required checkbox group of scheduled offensive trades. */
export async function fillBusinessActivities(
  page: Page,
  activities: readonly BusinessActivity[],
): Promise<void> {
  const step = expectStep(page, "business-activities");
  await expect(page.locator("h1")).toContainText("What will the business do");
  for (const activity of activities) {
    await tickCheckbox(page, step, "business-activities", activity);
  }
  await advance(page, step);
}

/**
 * Assert the unreachable `building-plans` step really did not render, and that
 * the walk landed on "Check your answers" instead.
 *
 * This pins a recipe BUG, deliberately — see the ⚠ note in the header. The two
 * `stepConditionalOn` behaviours on that step are ANDed and are mutually
 * exclusive, so the building-plans upload is currently dead on both branches.
 * When the recipe is fixed this assertion fails, which is the point: the fix
 * has to come with an extended walk that actually uploads the plans.
 */
function expectBuildingPlansUnreachable(page: Page): string {
  const step = expectStep(page, "check-your-answers");
  expect(
    step,
    "building-plans became reachable — its two ANDed stepConditionalOn rules " +
      "must have been fixed. Extend this spec to upload the plans.",
  ).not.toContain("building-plans");
  return step;
}

/** Tick the single declaration checkbox and submit for real. */
async function confirmAndSubmit(page: Page): Promise<void> {
  const step = expectStep(page, "declaration");
  await expect(page.locator("h1")).toContainText("Your agreement");
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
  // work address. The generic "your local polyclinic" fallback means resolution
  // failed, which would also mean the polyclinic never got its copy of the
  // application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

test.describe("Offensive Trade Licence — Live Smoke", () => {
  test("submits a new licence, skipping renewal details entirely", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data);
    await fillApplicationType(page, "new");

    // "new" hides the whole `renewal-details` step — the walk goes straight to
    // the work address. Asserted, so a stepConditionalOn that stops resolving
    // strands the run here instead of failing later on an unanswerable field.
    expect(
      expectStep(page, "work-address"),
      "a new application must skip renewal-details",
    ).not.toContain("renewal-details");
    const coordinates = await fillWorkAddress(page, data);

    await fillBusinessActivities(page, ["tanning", "soap-boiling"]);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectBuildingPlansUnreachable(page);
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.businessName).first()).toBeVisible();
    // A new application was never asked for a licence number.
    await expect(page.getByText(data.currentLicenceNumber)).toHaveCount(0);
    // The coordinate the catchment routes on was resolved from the WORK
    // address. Logged so a real run can be traced to a polyclinic.
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] work coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits a renewal at an unchanged address with building work declared", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data);
    await fillApplicationType(page, "renewal");
    // "no" to address-changed is what reveals building-changes; "yes" to that
    // reveals the description. Both inline on `renewal-details`.
    await fillRenewalDetails(page, data, {
      addressChanged: "no",
      buildingChanges: "yes",
    });
    const coordinates = await fillWorkAddress(page, data);

    await fillBusinessActivities(page, [
      "slaughtering",
      "blood-offal-boiling",
      "tallow-melting",
    ]);

    // Declaring building work is the one answer that was MEANT to ask for the
    // plans — and still does not. See the ⚠ note in the header.
    const step = expectBuildingPlansUnreachable(page);
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(
      page.getByText(data.currentLicenceNumber).first(),
    ).toBeVisible();
    await expect(page.getByText(data.buildingChanges).first()).toBeVisible();
    await expect(page.getByText(data.businessName).first()).toBeVisible();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data] work coordinates:", coordinates);
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
