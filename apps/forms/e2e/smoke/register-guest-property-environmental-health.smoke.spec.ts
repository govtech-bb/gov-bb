/**
 * register-guest-property-environmental-health.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Register a guest property with
 * Environmental Health service (formId
 * `register-guest-property-environmental-health`, programme `GUEST_PROPERTY`).
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
 *     --config playwright.smoke.config.ts register-guest-property
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
 *  - `is-property-owner` is the only branch, and it is a STEP gate
 *    (stepConditionalOn), not an inline reveal: answering "no" puts
 *    `owner-details` into the journey, "yes" skips it entirely. The two tests
 *    below cover both answers.
 *  - RECIPE GAP, deliberately encoded here rather than worked around:
 *    `applicant-role-owner` (radio) and `applicant-role-other` (free text) carry
 *    NO `fieldConditionalOn` behaviour, so both render on every run and both are
 *    `required: true`. Reading the labels, `applicant-role-owner` should surely
 *    be gated on `is-property-owner` = "no", and `applicant-role-other` on
 *    `applicant-role-owner` = "another-role". Until the recipe is fixed the form
 *    genuinely asks an owner what their role at their own property is, twice —
 *    so this spec answers both on both branches, because anything less will not
 *    advance the step. Tracked in the issue this spec was added under (#2414).
 *  - The property address is an address-lookup (geocoder) field, so it cannot
 *    take a free-text faker address — the geocoder must return a real Barbados
 *    match to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` =
 *    `property-details.property-address-coordinates`). We faker-pick from a pool
 *    of known-geocodable locations, select the first suggestion, then assert
 *    `property-address-coordinates` filled.
 *  - `property-address-line-2` and `owner-address-line-2` are labelled
 *    "Address line 2" but the recipe does NOT set
 *    `validations.required.value: false` on either, so both inherit
 *    components/address's required + minLength 5 and BLOCK the step. Fill them.
 *  - `applicant-contact-number` is `components/contact-telephone`, whose `phone`
 *    rule runs libphonenumber-js `.isValid()` — a random `246 NNN NNNN` is
 *    rejected, the exchange has to be a real assignable one.
 *  - There are no uploads and no repeatable steps on this form.
 *  - The confirmation step uses generic `nextSteps` copy with no `{polyclinic}`
 *    placeholder, so there is no resolved-catchment name on screen to assert.
 *    Catchment routing still runs (it drives the MDA email and the CaMS sync
 *    added in #2408), it just isn't surfaced to the applicant. Don't add a
 *    /Polyclinic/ assertion here; it would fail.
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
} from "../helpers/smoke";

export const FORM_ID = "register-guest-property-environmental-health";

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
    applicantFirstName: faker.person.firstName(),
    applicantMiddleName: faker.person.middleName(),
    applicantLastName: faker.person.lastName(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    applicantEmail: "testing@govtech.bb",
    applicantContactNumber: bbMobileNumber(),
    // See the header note: this text field is required on every run, whatever
    // `applicant-role-owner` says.
    applicantRoleOther: "Smoke test role",

    ownerFullName: `${faker.person.firstName()} ${faker.person.lastName()}`,
    ownerAddressLine1: faker.location.streetAddress(),
    ownerAddressLine2: faker.location.street(),
    ownerParish: faker.helpers.arrayElement(PARISH_VALUES),

    propertyAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    propertyAddressLine2: faker.location.street(),
    propertyRooms: String(faker.number.int({ min: 1, max: 30 })),
    propertyOccupants: String(faker.number.int({ min: 1, max: 60 })),
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
 * Step 1 — the applicant, and the only branch. `isPropertyOwner` = "no" puts the
 * `owner-details` step into the journey.
 */
export async function fillYourDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
  isPropertyOwner: "yes" | "no",
  role: "manager" | "attorney" | "another-role",
): Promise<void> {
  const step = expectStep(page, "your-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await selectRadio(page, step, "is-property-owner", isPropertyOwner);
  await fillField(page, step, "applicant-first-name", data.applicantFirstName);
  await fillField(
    page,
    step,
    "applicant-middle-name",
    data.applicantMiddleName,
  );
  await fillField(page, step, "applicant-last-name", data.applicantLastName);
  // Both role fields are unconditionally visible and required — see the header
  // note. Answering only one of them will not advance the step.
  await selectRadio(page, step, "applicant-role-owner", role);
  await fillField(page, step, "applicant-role-other", data.applicantRoleOther);
  await fillField(page, step, "applicant-email", data.applicantEmail);
  await fillField(
    page,
    step,
    "applicant-contact-number",
    data.applicantContactNumber,
  );
  await advance(page, step);
}

/** Step 2 — the property owner. Only in the journey when the applicant isn't them. */
export async function fillOwnerDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "owner-details");
  await expect(page.locator("h1")).toContainText("Property owner details");
  await fillField(page, step, "owner-full-name", data.ownerFullName);
  await fillField(page, step, "owner-address-line-1", data.ownerAddressLine1);
  await fillField(page, step, "owner-address-line-2", data.ownerAddressLine2);
  await selectDropdown(page, step, "owner-parish", data.ownerParish);
  await advance(page, step);
}

/** Step 3 — the property itself, including the geocoded address. */
export async function fillPropertyDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "property-details");
  await expect(page.locator("h1")).toContainText("Property details");
  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "property-address-line-1",
      coordinatesFieldId: "property-address-coordinates",
    },
    data.propertyAddress,
  );
  await fillField(
    page,
    step,
    "property-address-line-2",
    data.propertyAddressLine2,
  );
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_property-parish"]`),
  ).not.toHaveValue("");
  await fillField(page, step, "property-number-of-rooms", data.propertyRooms);
  await fillField(
    page,
    step,
    "property-number-of-occupants",
    data.propertyOccupants,
  );
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

test.describe("Register Guest Property (Environmental Health) — Live Smoke", () => {
  test("submits as the property owner, skipping the owner-details step", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data, "yes", "manager");
    // The gated step is out of the journey, so step 1 leads straight here.
    await fillPropertyDetails(page, data);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.applicantLastName).first()).toBeVisible();
    // The owner's name was never asked on this branch.
    await expect(page.getByText(data.ownerFullName)).toHaveCount(0);
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("submits on behalf of the owner, taking the owner-details step", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillYourDetails(page, data, "no", "another-role");
    await fillOwnerDetails(page, data);
    await fillPropertyDetails(page, data);

    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The gated step's answers made it into the review.
    await expect(page.getByText(data.ownerFullName).first()).toBeVisible();
    await expect(page.getByText(data.ownerAddressLine1).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
