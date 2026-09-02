/**
 * apply-for-funeral-director-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Funeral Directors Licence service
 * (formId `apply-for-funeral-director-licence`, programme
 * `FUNERAL_DIRECTOR_LICENCE`).
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
 *     --config playwright.smoke.config.ts apply-for-funeral-director-licence
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
 *  - This recipe was published from a copy of the hairdresser licence form.
 *    Its copy, routing config and field IDs have all since been corrected,
 *    so what remains inherited is only the SHAPE of `workplace-details`.
 *  - Every step's `behaviours` array is `[]` — there is no step-level gate.
 *    Unlike apply-for-hairdresser-licence, which gates the whole
 *    `workplace-details` step behind a separate `workplace-known` step, that
 *    gating step does not exist here, so the journey is always
 *    personal-details → contact-details → workplace-details → documents →
 *    check-your-answers → declaration → submission-confirmation. One test
 *    covers the whole form.
 *  - Email and phone live on their own `contact-details` step ("How can we
 *    contact you?"), split out of `personal-details` by #2583 — the same shape
 *    apply-for-funeral-embalmer-licence and apply-for-hairdresser-licence
 *    already carry. The recipe's processors read `contact-details.email` /
 *    `.phone-number`, so filling them on the wrong step would silently break
 *    the applicant's copy of the confirmation email.
 *  - `national-id-number` (`components/national-id-number`) is REQUIRED on
 *    `personal-details` and carries a Maskito hard mask (`999999-9999`). Type
 *    the ten raw digits and let the mask insert the dash — a `fill()` of the
 *    formatted string fights the mask. Added by #2583, same idiom as the
 *    embalmer and hairdresser specs.
 *  - `workplace-details` does carry ELEMENT-level reveals, on the individual
 *    fields (`overrides.behaviours`, not the step's):
 *    `funeral-establishment-name`, `-address-line-1`, `-address-line-2` and
 *    `-parish` are `fieldConditionalOn workplace-locations in
 *    ["at-funeral-establishment"]`; `somewhere-else` is the same on
 *    ["somewhere-else"]. `workplace-locations` is a checkbox (operator "in"),
 *    so this test ticks BOTH options to exercise every conditional field in
 *    the single journey the form has.
 *  - `funeral-establishment-name`, `funeral-establishment-address-line-1`,
 *    `funeral-establishment-parish` and `somewhere-else` set no `required`
 *    override, so each inherits `required: true` from its registry primitive
 *    (`components/generic-text`, `components/address`, `components/parish`).
 *    Only `funeral-establishment-address-line-2` sets `required: false`
 *    explicitly, matching `address-line-2` on `personal-details` — both are
 *    left empty on purpose, to prove the optional rule holds.
 *  - `address-line-1` is `components/address-lookup`, so it cannot take a
 *    free-text faker address — the geocoder must return a real Barbados match
 *    to populate the hidden coordinates the catchment router reads
 *    (`catchmentRouting.coordinatesField` =
 *    `personal-details.address-coordinates`). We faker-pick from a pool of
 *    known-geocodable locations, select the first suggestion, then assert
 *    `address-coordinates` filled.
 *  - `phone-number` is `components/telephone`, whose `phone` rule runs
 *    libphonenumber-js `.isValid()` — a random `246 NNN NNNN` is rejected, the
 *    exchange has to be a real assignable one.
 *  - All three `documents` uploads (`passport-photo`, `upload-scanned-id` and
 *    `letter-evidencing`, the last added by #2583) use
 *    `components/upload-document` with `multiple: false`, so each is a single
 *    confirmed upload via `uploadOne`, not `uploadMany`.
 *  - The confirmation step's `nextSteps` copy (fixed off "hairdresser licence"
 *    in this PR) has no `{polyclinic}` placeholder, so there is no
 *    resolved-catchment name on screen to assert. Catchment routing still
 *    runs — it just isn't surfaced to the applicant. Don't add a /Polyclinic/
 *    assertion here; it would fail.
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
  submitAndConfirm,
  tickCheckbox,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-funeral-director-licence";

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

/**
 * Ten raw digits in National ID shape (YYMMDD + 4). Typed digit-by-digit so
 * Maskito inserts the dash and the value matches `^\d{6}-\d{4}$`.
 */
function nationalIdDigits(): string {
  const dob = faker.date.birthdate({ min: 21, max: 70, mode: "age" });
  const yy = String(dob.getFullYear()).slice(-2);
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const dd = String(dob.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}${faker.string.numeric(4)}`;
}

/** Build a complete, valid set of answers for the single journey. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    nationalIdDigits: nationalIdDigits(),
    address: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbMobileNumber(),

    // Timestamped so the resulting submission is easy to find in the target env.
    establishmentName: `Smoke Test Funeral Establishment ${new Date().toISOString()}`,
    establishmentAddressLine1: faker.location.streetAddress(),
    establishmentParish: faker.helpers.arrayElement(PARISH_VALUES),
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
 * Fill the Maskito-masked National ID: type the ten raw digits so the mask
 * inserts the dash, then assert the formatted shape actually landed.
 */
async function fillMaskedNationalId(
  page: Page,
  stepId: string,
  digits: string,
): Promise<void> {
  const input = page.locator(`input[id="${stepId}_national-id-number"]`);
  await input.pressSequentially(digits);
  await expect(input, "Maskito did not format the National ID").toHaveValue(
    /^\d{6}-\d{4}$/,
  );
}

/** Step 1 — the applicant. */
export async function fillPersonalDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "personal-details");
  await expect(page.locator("h1")).toContainText("Tell us about yourself");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillMaskedNationalId(page, step, data.nationalIdDigits);
  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "address-line-1",
      coordinatesFieldId: "address-coordinates",
    },
    data.address,
  );
  // address-line-2 is left empty on purpose — the recipe sets
  // required: false, and this step advancing is the proof.
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback when the
  // coordinates miss every polygon.
  await expect(
    page.locator(`select[id="${step}_home-parish"]`),
  ).not.toHaveValue("");
  await advance(page, step);
}

/** Step 2 — email and phone, split onto their own step by #2583. */
export async function fillContactDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "contact-details");
  await expect(page.locator("h1")).toContainText("How can we contact you");
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "phone-number", data.phone);
  await advance(page, step);
}

/**
 * Step 2 — workplace details. Ticking "at-funeral-establishment" reveals the establishment block
 * (funeral-establishment-name / funeral-establishment-address-line-1 / funeral-establishment-address-line-2 / funeral-establishment-parish);
 * ticking "somewhere-else" independently reveals the free-text
 * `somewhere-else` field. Both blocks are ticked so every inherited-required
 * field in this step (funeral-establishment-name, funeral-establishment-address-line-1, funeral-establishment-parish,
 * somewhere-else) is exercised and filled.
 */
export async function fillWorkplaceDetails(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "workplace-details");
  await expect(page.locator("h1")).toContainText("where you plan to work");

  const establishmentName = page.locator(
    `[id="${step}_funeral-establishment-name"]`,
  );
  const somewhereElse = page.locator(`[id="${step}_somewhere-else"]`);
  await expect(establishmentName).toBeHidden();
  await expect(somewhereElse).toBeHidden();

  await tickCheckbox(
    page,
    step,
    "workplace-locations",
    "at-funeral-establishment",
  );
  await expect(establishmentName).toBeVisible({ timeout: STEP_TIMEOUT });
  // "at-funeral-establishment" reveals the establishment block but not the other free-text field.
  await expect(somewhereElse).toBeHidden();

  await tickCheckbox(page, step, "workplace-locations", "somewhere-else");
  await expect(somewhereElse).toBeVisible({ timeout: STEP_TIMEOUT });

  await establishmentName.fill(data.establishmentName);
  await fillField(
    page,
    step,
    "funeral-establishment-address-line-1",
    data.establishmentAddressLine1,
  );
  // funeral-establishment-address-line-2 is left empty on purpose — the recipe sets
  // required: false, and this step advancing is the proof.
  await selectDropdown(
    page,
    step,
    "funeral-establishment-parish",
    data.establishmentParish,
  );
  await somewhereElse.fill(data.somewhereElse);
  await advance(page, step);
}

/** Step 3 — both required documents. */
export async function fillDocuments(page: Page): Promise<void> {
  const step = expectStep(page, "documents");
  await expect(page.locator("h1")).toContainText("Add your documents");
  await uploadOne(page, step, "passport-photo", {
    name: "passport-photo.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await uploadOne(page, step, "upload-scanned-id", {
    name: "national-id.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
  await uploadOne(page, step, "letter-evidencing", {
    name: "letter-of-evidence.png",
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

test.describe("Funeral Directors Licence Application — Live Smoke", () => {
  test("submits a complete application working at an establishment and somewhere else", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillPersonalDetails(page, data);
    await fillContactDetails(page, data);
    await fillWorkplaceDetails(page, data);
    await fillDocuments(page);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.establishmentName).first()).toBeVisible();
    await expect(page.getByText(data.somewhereElse).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
