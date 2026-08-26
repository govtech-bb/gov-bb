/**
 * apply-for-swimming-pool-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the swimming pool licence service
 * (formId `apply-for-swimming-pool-licence`, programme `SWIMMING_POOL_PERMIT`).
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
 *  - The form is FOUR authored steps: `about-application`, `your-details`,
 *    `pool-details` and `supporting-documents`. This is the #2451 rebuild's
 *    shape, re-integrated in #2507 — an earlier recipe spread the pool across
 *    six separately-repeatable steps plus a hand-rolled `add-another-pool`, so
 *    pool 2's capacity had no guaranteed relationship to pool 2's address. If
 *    you are looking for `about-pool` / `pool-capacity` / `pool-usage` /
 *    `pool-address` / `pool-facilities` / `pool-chemical-maintenance`, they are
 *    gone — the first four collapsed into `pool-details`, and the last two were
 *    dropped by the rebuild (flagged on #2507 for MDA confirmation).
 *  - `pool-details` is the ONLY repeatable step. It renders its own `addAnother`
 *    radio, addressed as `pool-details_addAnother-{yes,no}`, which must be
 *    answered before the step will advance. Every walk below answers "no" — the
 *    single-pool path. Because the whole pool (type, capacity, usage, address)
 *    is one instance, the fields are addressed plainly as
 *    `${stepId}_${fieldId}` for the first instance.
 *  - Two branches, both inline on `pool-details`: `owner-type` = "manager"
 *    reveals `connection-to-pool`, and `pool-same-address` = "no" reveals the
 *    three pool address fields. `pool-usage-type` including "other" reveals
 *    `other-pool`. The second test takes all three.
 *  - `pool-usage-type` is a CHECKBOX group (multi-select), not a radio — tick
 *    options rather than selecting one. Its reveal of `other-pool` uses the
 *    `in` operator against `["other"]`, since a checkbox submits a list.
 *  - `supporting-documents` DOES render, and its uploads are required again
 *    (#2507 restored the rules the rebuild lost). The branch is
 *    `about-application.application-type`: "new" asks for the Town and Country
 *    Planning Site Plan plus an optional application number, "renewal" asks for
 *    the Pool Plan. Unlike the pre-#2507 recipe these conditionals carry an
 *    explicit `targetStepId`, so they resolve across steps instead of silently
 *    hiding everything — that was issue #2426, and this recipe is no longer
 *    one of its cases.
 *  - Applicant name / parish / email carry no `fieldId` override in the recipe,
 *    so they keep their component defaults (`first-name`, `parish`, `email`) —
 *    which is also what `catchmentRouting.parishField` (`your-details.parish`)
 *    refers to.
 *  - The applicant address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` =
 *    `your-details.your-address-coordinates`). We faker-pick from a pool of
 *    known-geocodable locations, select the first suggestion, then assert the
 *    coordinates filled.
 *  - Picking a suggestion also fills `your-address-line-2` and `parish`. Line 2
 *    is optional here (the recipe sets `required: false`), but we overwrite it
 *    with faker data so the submitted record is deterministic; `parish` is
 *    asserted rather than overwritten, since that value is the catchment
 *    router's fallback.
 *  - The applicant phone is `components/mobile-telephone` — `mobile-telephone`,
 *    not `phone-number`. It is what the webhook maps applicant phone from
 *    (`your-details.mobile-telephone`). It validates with libphonenumber-js, so
 *    the number needs a real Barbados exchange. `work-telephone` sits beside it
 *    and is optional; we leave it empty.
 *  - The pool address is a plain `components/address`, NOT geocoded — the
 *    catchment is resolved from the APPLICANT's address regardless of where the
 *    pool is. That is what #2405 shipped and what #2507 ported forward
 *    unchanged, but it is worth knowing: the landing page tells citizens their
 *    application goes to the polyclinic for the pool's location, and a pool in
 *    another parish routes to the applicant's polyclinic instead. Routing on the
 *    pool address is blocked on `pool-details` being repeatable — `readPath`
 *    would find a list, not a value.
 *  - The confirmation screen's "What happens next" copy is asserted. It lives in
 *    `markdownContent`, which `hydrateStep` (apps/api/src/registry/resolution.ts)
 *    carries into the served contract; `nextSteps` — where the #2451 rebuild put
 *    it — is deliberately NOT carried, so the copy rendered nothing until #2507
 *    moved it back. NOTE the ordering: this assertion only passes once that
 *    recipe has deployed to the target environment.
 *    There is still no `{polyclinic}` placeholder in the copy, so the resolved
 *    catchment name is not on the screen to assert. Catchment routing does run
 *    — it drives the MDA email. `markdownContent` supports a `{polyclinic}`
 *    token if that is ever wanted here.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
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

    planningApplicationNumber: `TCP/${faker.string.numeric(5)}`,
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

/** Step 1 — application type. Gates the supporting-documents branch. */
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
  // The geocoder writes the hidden coordinates the catchment router reads — an
  // empty one is a real failure, which the helper asserts rather than skips.
  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "your-address-line-1",
      coordinatesFieldId: "your-address-coordinates",
    },
    data.address,
  );
  // Line 2 is optional and the picked suggestion already wrote something —
  // overwrite it so the submitted record is deterministic.
  await fillField(page, step, "your-address-line-2", data.addressLine2);
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
 * Step 3 — the whole pool, on one repeatable step. Three inline reveals:
 * `owner-type` = "manager" shows `connection-to-pool`, `pool-usage-type`
 * including "other" shows `other-pool`, and `pool-same-address` = "no" shows the
 * three pool address fields. The step's own `addAnother` radio is answered "no"
 * on every walk — the single-pool path.
 */
export async function fillPoolDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  branch: {
    ownerType: "business-owner" | "manager";
    poolType: "swimming" | "wading" | "jacuzzi";
    usageType:
      | "hotel"
      | "apartment"
      | "public"
      | "condo-home"
      | "school"
      | "other";
    sameAddress: "yes" | "no";
  },
): Promise<void> {
  const step = expectStep(page, "pool-details");
  await expect(page.locator("h1")).toContainText(
    "Pool details and maintenance",
  );

  // ─── Who is applying — "manager" is asked how they are connected ──────────
  const connection = page.locator(`[id="${step}_connection-to-pool"]`);
  await expect(connection).toBeHidden();
  await selectRadio(page, step, "owner-type", branch.ownerType);
  if (branch.ownerType === "manager") {
    await expect(connection).toBeVisible({ timeout: STEP_TIMEOUT });
    await connection.fill(data.connectionToPool);
  } else {
    // The gate's whole purpose: an owner is not asked how they are connected.
    await expect(connection).toBeHidden();
  }

  // ─── The pool itself ─────────────────────────────────────────────────────
  await selectRadio(page, step, "pool-type", branch.poolType);
  await fillField(page, step, "pool-name", data.poolName);
  await fillField(page, step, "pool-water-capacity-number", data.waterCapacity);
  await selectDropdown(page, step, "pool-capacity-unit", "gallons");

  // ─── Usage — a checkbox group; "other" reveals the free-text description ───
  const description = page.locator(`[id="${step}_other-pool"]`);
  await expect(description).toBeHidden();
  await tickCheckbox(page, step, "pool-usage-type", branch.usageType);
  if (branch.usageType === "other") {
    await expect(description).toBeVisible({ timeout: STEP_TIMEOUT });
    await description.fill(data.poolUsageDescription);
  } else {
    await expect(description).toBeHidden();
  }

  // ─── Pool address — "no" reveals the three fields inline ──────────────────
  const line1 = page.locator(`[id="${step}_pool-address-line-1"]`);
  await expect(line1).toBeHidden();
  await selectRadio(page, step, "pool-same-address", branch.sameAddress);
  if (branch.sameAddress === "no") {
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

/**
 * Step 4 — supporting documents, branched on `application-type`. A new licence
 * needs the Town and Country Planning Site Plan (required) and may carry the
 * planning application number (optional); a renewal needs the Pool Plan.
 * Whichever branch is not taken must render nothing — asserted, so a
 * conditional that stops resolving fails here loudly.
 */
export async function fillSupportingDocuments(
  page: Page,
  data: ReturnType<typeof buildData>,
  applicationType: "new" | "renewal",
): Promise<void> {
  const step = expectStep(page, "supporting-documents");
  await expect(page.locator("h1")).toContainText("Supporting documents");

  const planningPlan = page.locator(
    `input[type=file][id="${step}_town-country-planning-plan"]`,
  );
  const poolPlan = page.locator(`input[type=file][id="${step}_pool-plan"]`);

  if (applicationType === "new") {
    await expect(poolPlan).toBeHidden();
    await uploadOne(page, step, "town-country-planning-plan", {
      name: "town-country-planning-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await fillField(page, step, "town-text", data.planningApplicationNumber);
  } else {
    await expect(planningPlan).toBeHidden();
    await uploadOne(page, step, "pool-plan", {
      name: "pool-plan.png",
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
    .locator(`input[id="${step}_declaration-confirmed-confirmed"]`)
    .check();

  await submitAndConfirm(page, {
    heading: "Application submitted",
    referenceLabel: "Submission ID",
  });

  // The recipe's "What happens next" copy, carried in `markdownContent` —
  // `nextSteps` is never hydrated. Only passes once the #2507 recipe has
  // deployed to the target environment — see the header note.
  await expect(
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  await expect(page.getByText(/sent to Environmental Health/)).toBeVisible();
}

test.describe("Swimming Pool Licence — Live Smoke", () => {
  test("submits a new licence as a business owner, never asked how they are connected", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutApplication(page, "new");
    await fillYourDetails(page, data);
    await fillPoolDetails(page, data, {
      ownerType: "business-owner",
      poolType: "swimming",
      usageType: "hotel",
      sameAddress: "yes",
    });
    await fillSupportingDocuments(page, data, "new");

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
    // "manager" reveals the connection question, "other" the usage description,
    // and "no" the pool address — all three inline on the one pool step.
    await fillPoolDetails(page, data, {
      ownerType: "manager",
      poolType: "jacuzzi",
      usageType: "other",
      sameAddress: "no",
    });
    await fillSupportingDocuments(page, data, "renewal");

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
