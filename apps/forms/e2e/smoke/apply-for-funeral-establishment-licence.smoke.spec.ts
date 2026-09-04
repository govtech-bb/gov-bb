/**
 * apply-for-funeral-establishment-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Funeral Establishment Licence service
 * (formId `apply-for-funeral-establishment-licence`, programme
 * `FUNERAL_ESTABLISHMENT_LICENCE`).
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
 *     --config playwright.smoke.config.ts funeral-establishment-licence
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
 *  - The journey is linear: there are no step gates, no inline reveals and no
 *    repeatable steps, so one test covers the whole form. A second test would
 *    only re-run the same path.
 *  - The establishment address is an address-lookup (geocoder) field, so it
 *    cannot take a free-text faker address — the geocoder must return a real
 *    Barbados match to populate the hidden coordinates the catchment router
 *    reads (`catchmentRouting.coordinatesField` =
 *    `establishment-information.establishment-address-coordinates`). We
 *    faker-pick from a pool of known-geocodable locations, select the first
 *    suggestion, then assert `establishment-address-coordinates` filled.
 *  - Both "Address line 2" fields DO set `validations.required.value: false`,
 *    unlike the hotel / hairdresser / guest-property recipes where line 2
 *    silently inherits components/address's required + minLength 5. This spec
 *    deliberately leaves the applicant's line 2 empty: if that optional rule
 *    ever regresses, the step stops advancing and this test says so.
 *  - `telephone` is `components/telephone`, whose `phone` rule runs
 *    libphonenumber-js `.isValid()` — a random `246 NNN NNNN` is rejected, the
 *    exchange has to be a real assignable one.
 *  - `max-bodies`, `male-embalmers` and `female-embalmers` are
 *    `components/generic-number` with no `required` override, so they inherit
 *    the primitive's `required: true` and all three must be answered.
 *  - `embalmer-list` is a single-file upload and is required. It used to be
 *    `components/generic-file` (required by default); it is now
 *    `components/upload-document`, which ships NO validations, so `required`
 *    is declared explicitly in the recipe alongside `fileTypes` +
 *    `itemMaxSize`. The allowlist accepts PNG, so the upload below is
 *    unaffected.
 *  - The confirmation step's `markdownContent` opens with the `{polyclinic}`
 *    token, so the resolved-catchment name IS on screen. We assert the
 *    Environmental Health copy rather than the name itself: which polyclinic
 *    resolves depends on the faker-picked address, so pinning a specific one
 *    would flake.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectStep,
  fillField,
  fillGeocodedAddress,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "apply-for-funeral-establishment-licence";

/**
 * Real, geocodable Barbados locations. A free-text faker address won't resolve,
 * and the catchment router needs the hidden coordinates the geocoder writes when
 * a suggestion is picked — so the establishment address is chosen from this pool.
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

  const rooms = faker.number.int({ min: 3, max: 9 });

  return {
    firstName: faker.person.firstName(),
    middleName: faker.person.middleName(),
    lastName: faker.person.lastName(),
    addressLine1: faker.location.streetAddress(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    email: "testing@govtech.bb",
    telephone: bbMobileNumber(),

    // Timestamped so the resulting submission is easy to find in the target env.
    establishmentName: `Smoke Test Funeral Home ${new Date().toISOString()}`,
    establishmentAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    preparationRoomDimensions: `${rooms}m x ${faker.number.int({ min: 3, max: 9 })}m`,
    maxBodies: String(faker.number.int({ min: 1, max: 40 })),

    maleEmbalmers: String(faker.number.int({ min: 0, max: 10 })),
    femaleEmbalmers: String(faker.number.int({ min: 0, max: 10 })),
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
export async function fillAboutTheApplicant(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "about-the-applicant");
  await expect(page.locator("h1")).toContainText("About you");
  await fillField(page, step, "first-name", data.firstName);
  await fillField(page, step, "middle-name", data.middleName);
  await fillField(page, step, "last-name", data.lastName);
  await fillField(page, step, "address-line-1", data.addressLine1);
  // address-line-2 is left empty on purpose — the recipe sets
  // required: false, and this step advancing is the proof. See the header note.
  await fillField(page, step, "email", data.email);
  await fillField(page, step, "telephone", data.telephone);
  await advance(page, step);
}

/** Step 2 — the establishment, including the geocoded address that routes it. */
export async function fillEstablishmentInformation(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "establishment-information");
  await expect(page.locator("h1")).toContainText("Establishment information");
  await fillField(page, step, "establishment-name", data.establishmentName);
  await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "establishment-address-line-1",
      coordinatesFieldId: "establishment-address-coordinates",
    },
    data.establishmentAddress,
  );
  // The geocoder fills parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback when the
  // coordinates miss every polygon.
  await expect(
    page.locator(`select[id="${step}_establishment-address-parish"]`),
  ).not.toHaveValue("");
  await fillField(
    page,
    step,
    "preparation-room-dimensions",
    data.preparationRoomDimensions,
  );
  await fillField(page, step, "max-bodies", data.maxBodies);
  await advance(page, step);
}

/** Step 3 — embalmer counts and the required list upload. */
export async function fillStaffInformation(
  page: Page,
  data: ReturnType<typeof buildData>,
): Promise<void> {
  const step = expectStep(page, "staff-information");
  await expect(page.locator("h1")).toContainText("Staff information");
  await fillField(page, step, "male-embalmers", data.maleEmbalmers);
  await fillField(page, step, "female-embalmers", data.femaleEmbalmers);
  await uploadOne(page, step, "embalmer-list", {
    name: "embalmer-list.png",
    mimeType: TEST_PNG.mimeType,
    buffer: TEST_PNG.buffer,
  });
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

  // The confirmation markdown names the resolved polyclinic's Environmental
  // Health Department — assert that copy, not a specific polyclinic name. See
  // the header note.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
}

test.describe("Funeral Establishment Licence — Live Smoke", () => {
  test("submits a complete application with an embalmer list", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillAboutTheApplicant(page, data);
    await fillEstablishmentInformation(page, data);
    await fillStaffInformation(page, data);

    // ─── Check your answers ─────────────────────────────────────────────────
    const step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.establishmentName).first()).toBeVisible();
    await expect(page.getByText(data.lastName).first()).toBeVisible();
    // SMOKE_HOLD_CYA=1 pauses a headed run here so the review screen can be
    // inspected before anything is submitted (matches the sibling specs).
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    await confirmAndSubmit(page);

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
