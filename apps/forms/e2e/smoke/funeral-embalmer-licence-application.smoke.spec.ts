/**
 * funeral-embalmer-licence-application.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Embalmer Licence service (formId
 * `funeral-embalmer-licence-application`, programme `EMBALMER_LICENCE`).
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
 *     --config playwright.smoke.config.ts funeral-embalmer-licence
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
 *    Unlike hairdresser-licence-application, which gates the whole
 *    `workplace-details` step behind a separate `workplace-known` step, that
 *    gating step does not exist here, so the journey is always
 *    personal-details → workplace-details → documents → check-your-answers →
 *    declaration → submission-confirmation. One test covers the whole form.
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
 *  - The applicant's address is an address-lookup (geocoder) field, so it
 *    cannot take a free-text faker address — the geocoder must return a real
 *    Barbados match to populate the hidden coordinates the catchment router
 *    reads (`catchmentRouting.coordinatesField` =
 *    `personal-details.address-coordinates`). We faker-pick from a pool of
 *    known-geocodable locations, select the first suggestion, then assert
 *    `address-coordinates` filled.
 *  - `phone-number` is `components/telephone`, whose `phone` rule runs
 *    libphonenumber-js `.isValid()` — a random `246 NNN NNNN` is rejected, the
 *    exchange has to be a real assignable one.
 *  - Both `documents` uploads (`passport-photo`, `medical-certificate`) are
 *    required, single-file (`components/upload-document`, `multiple: false`)
 *    fields, so each needs its own confirmed `uploadOne` call.
 *  - The confirmation step's `nextSteps` copy has no `{polyclinic}`
 *    placeholder, so there is no resolved-catchment name on screen to assert.
 *    Catchment routing still runs — it picks the polyclinic that gets the MDA
 *    email and composes the CaMS programme code — it just isn't surfaced to
 *    the applicant. Don't add a /Polyclinic/ assertion here; it would fail.
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

export const FORM_ID = "funeral-embalmer-licence-application";

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

/** Build a complete, valid set of answers for the single journey. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    address: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    phone: bbMobileNumber(),

    // Timestamped so the resulting submission is easy to find in the target env.
    establishmentName: `Smoke Test Funeral Establishment ${new Date().toISOString()}`,
    establishmentAddressLine1: faker.location.streetAddress(),
    establishmentParish: faker.helpers.arrayElement(PARISH_VALUES),
    somewhereElse:
      "At other locations across the island as required (smoke test)",
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
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "phone-number", data.phone);
  await advance(page, step);
}

/**
 * Step 2 — workplace details. There is no step-level gate (see header note),
 * so this step is always visited, but the establishment fields and `somewhere-else`
 * are individually revealed by ticking the matching `workplace-locations`
 * checkbox option. Ticking both options in one pass exercises every
 * conditional field the recipe has.
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
  // required: false, same as personal-details.address-line-2.
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

  // No {polyclinic} placeholder on this recipe's confirmation step — assert
  // the Environmental Health nextSteps copy instead. See the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
}

test.describe("Funeral Embalmer Licence Application — Live Smoke", () => {
  test("submits a complete application with both workplace options revealed", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillPersonalDetails(page, data);
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
