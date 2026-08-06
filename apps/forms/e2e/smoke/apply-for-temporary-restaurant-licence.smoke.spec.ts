/**
 * apply-for-temporary-restaurant-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the Temporary Restaurant Licence form
 * (formId `apply-for-temporary-restaurant-licence`).
 *
 * It drives the REAL deployed form (default: the sandbox environment), fills
 * every step with valid @faker-js/faker data, SUBMITS FOR REAL, and asserts the
 * confirmation screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke it runs ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (see ADR 0027 / 0029), and no workflow runs it automatically:
 * forms-smoke.yml only ever runs the ONE spec its caller names, so this file is
 * inert in CI until it is explicitly wired in.
 *
 * Run it on demand (from the repo root):
 *   pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts apply-for-temporary-restaurant-licence
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment (default https://forms.sandbox.alpha.gov.bb)
 *   PREVIEW_TOKEN    forms preview secret — appended as ?preview=<token> so the
 *                    run can reach the form while it is still visibility:preview.
 *                    Kept out of the committed file so the secret never lands in
 *                    the repo; pass it on the command line (PREVIEW_TOKEN=… ...).
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes from the live walkthrough:
 *  - is-organiser is fixed to "no" (the applicant is not the organiser). This is
 *    the scenario the catchment-routing fix was verified against, and it keeps
 *    the required set minimal: only the medical certificate is a required
 *    upload (site-plan is optionalIf no, vendor-list is organiser-only), and the
 *    declaration has no organiser overtime-costs acknowledgement. The "yes"
 *    branch (num-patrons/num-stalls, extra required uploads, overtime notice) is
 *    intentionally not exercised here.
 *  - The event address is an address-lookup (geocoder) field, so it cannot take
 *    a free-text faker address — the geocoder must return a real Barbados match
 *    to populate the hidden coordinates the catchment router reads. We faker-pick
 *    from a small pool of known-geocodable locations and select the first
 *    suggestion, then assert the hidden `event-address-coordinates` field filled.
 *  - The national ID is a Maskito-masked field: fill() bypasses the mask, so the
 *    raw digits are typed with pressSequentially and the YYMMDD-NNNN shape is
 *    asserted (mirrors the vendor-registration spec).
 *  - food-served is a checkbox-accordion: open a category, then tick one leaf.
 *    The run also ticks the "Something else" category's `other` leaf, which
 *    reveals the required free-text food-served-other.
 *  - food-from-supplier is a single-option checkbox (value "yes", so the input
 *    id is `<step>_food-from-supplier-yes`). It gates the supplier name /
 *    address / phone / email fields, which are asserted hidden before it is
 *    ticked and then filled.
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
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

const FORM_ID = "apply-for-temporary-restaurant-licence";

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
 * and the catchment router needs the hidden coordinates the geocoder writes
 * when a suggestion is picked — so the event address is chosen from this pool.
 */
const GEOCODABLE_EVENT_ADDRESSES = [
  "Jemmotts Lane, Bridgetown",
  "Broad Street, Bridgetown",
  "Speightstown",
  "Holetown",
  "Oistins",
] as const;

/**
 * Valid Barbados mobile exchanges (the `2XX` after `246`). The phone validation
 * rule (packages/form-validation/src/rules/phone.ts) runs libphonenumber-js
 * `.isValid()` against real assignable ranges, so a random `246 NNN NNNN` is
 * rejected — the exchange must be a real one. Any 4-digit suffix then validates.
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

/** A libphonenumber-valid Barbados mobile number with a random suffix. */
function bbMobileNumber(): string {
  return `246 ${faker.helpers.arrayElement(BB_MOBILE_EXCHANGES)} ${faker.string.numeric(4)}`;
}

/** One leaf from the non-higher-risk "Cooked rice, pasta and starches" group. */
const RICE_GROUP_LABEL = "Cooked rice, pasta and starches";
const RICE_ITEMS = [
  "Rice",
  "Macaroni pie",
  "Pasta",
  "Cou-cou",
  "Fries",
  "Sweet potato",
  "Breadfruit",
  "Cassava",
  "Soup",
] as const;

/** The "Other" escape hatch at the foot of the accordion. */
const OTHER_GROUP_LABEL = "Something else";
const OTHER_ITEM_LABEL = "Other food or drink not listed";

/** Build a complete, valid set of answers for the is-organiser=no path. */
function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  // NRN must match ^\d{6}-\d{4}$ (mask 999999-9999): type 10 raw digits and let
  // Maskito insert the dash.
  const dob = faker.date.birthdate({ min: 21, max: 70, mode: "age" });
  const yy = String(dob.getFullYear()).slice(-2);
  const mm = String(dob.getMonth() + 1).padStart(2, "0");
  const dd = String(dob.getDate()).padStart(2, "0");
  const nrnDigits = `${yy}${mm}${dd}${faker.string.numeric(4)}`;

  // Event start must be >= 14 days out (recipe min: daysUntil 14). Give plenty
  // of margin; end date is the same day or a few days later.
  const start = new Date();
  start.setDate(start.getDate() + faker.number.int({ min: 21, max: 120 }));
  const end = new Date(start);
  end.setDate(end.getDate() + faker.number.int({ min: 0, max: 4 }));

  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    nrnDigits,
    addressLine1: faker.location.streetAddress(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    mobile: bbMobileNumber(),
    // Applicant email goes to the monitored test inbox so a real run is
    // verifiable end-to-end (incl. the confirmation email).
    applicantEmail: "testing@govtech.bb",

    organiserName: faker.person.fullName(),
    organiserPhone: bbMobileNumber(),
    organiserEmail: faker.internet.email().toLowerCase(),

    // Timestamped so the resulting submission is easy to find in the target env.
    eventName: `Smoke Test — ${faker.company.buzzNoun()} festival ${new Date().toISOString()}`,
    eventAddress: faker.helpers.arrayElement(GEOCODABLE_EVENT_ADDRESSES),
    start,
    end,
    startTime: "10:00",
    endTime: "22:00",

    foodItem: faker.helpers.arrayElement(RICE_ITEMS),
    otherFood: `${faker.commerce.productName()} (smoke test)`,
    supplierName: faker.company.name(),
    supplierAddress: faker.location.streetAddress(),
    supplierPhone: bbMobileNumber(),
    supplierEmail: faker.internet.email().toLowerCase(),

    handlersMale: String(faker.number.int({ min: 0, max: 6 })),
    handlersFemale: String(faker.number.int({ min: 1, max: 6 })),
    waterSource: faker.helpers.arrayElement([
      "Mains supply",
      "Water tank",
      "Bottled water",
    ]),
    handwashing: "Portable station with soap and paper towels",
    wasteDisposal: "Bagged and collected daily",
  };
}

/**
 * Fill the address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 */
async function fillGeocodedEventAddress(
  page: Page,
  stepId: string,
  query: string,
): Promise<string> {
  const combo = page.getByRole("combobox", { name: "Event address line 1" });
  await combo.click();
  // pressSequentially (not fill) so the debounced autocomplete actually fires.
  await combo.pressSequentially(query, { delay: 20 });

  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(
    `input[id="${stepId}_event-address-coordinates"]`,
  );
  await expect(
    coordinates,
    "geocoder did not populate the hidden event coordinates",
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

/**
 * Watchability: SMOKE_FIELD_DELAY=<ms> pauses AFTER each field is entered, so a
 * `--headed` run can be followed field-by-field. Unlike Playwright's global
 * `slowMo` (which delays every low-level action, including each keystroke of the
 * masked NRN and the geocoder autocomplete), this waits only between field
 * inputs. Defaults to 0 (no pause) for fast/CI runs.
 */
const FIELD_DELAY = Number(process.env.SMOKE_FIELD_DELAY) || 0;
async function afterField(page: Page): Promise<void> {
  if (FIELD_DELAY) await page.waitForTimeout(FIELD_DELAY);
}

// Thin wrappers: enter a field the usual way, then pause between fields.
async function field(
  page: Page,
  step: string,
  suffix: string,
  value: string,
): Promise<void> {
  await fillField(page, step, suffix, value);
  await afterField(page);
}
async function dropdown(
  page: Page,
  step: string,
  suffix: string,
  value: string,
): Promise<void> {
  await selectDropdown(page, step, suffix, value);
  await afterField(page);
}
async function radio(
  page: Page,
  step: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await selectRadio(page, step, suffix, optionValue);
  await afterField(page);
}
async function dateField(
  page: Page,
  step: string,
  suffix: string,
  day: number,
  month: number,
  year: number,
): Promise<void> {
  await fillDate(page, step, suffix, day, month, year);
  await afterField(page);
}

test.describe("Temporary Restaurant Licence — Live Smoke", () => {
  test("submits the real form end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const data = buildData();

    // Opt-in traceability: SMOKE_LOG_DATA=1 prints the exact generated values
    // (the run is otherwise fully random), so a passing run can be tied to the
    // resulting submission. Geocoded coordinates are logged once resolved below.
    const logData = !!process.env.SMOKE_LOG_DATA;
    if (logData) console.log("[smoke-data]", JSON.stringify(data, null, 2));

    // A preview-gated form needs the token; a public one ignores the param.
    const previewToken = process.env.PREVIEW_TOKEN;
    const landing = previewToken
      ? `/forms/${FORM_ID}?preview=${encodeURIComponent(previewToken)}`
      : `/forms/${FORM_ID}`;
    await page.goto(landing);
    await page.waitForURL((url) => !!url.searchParams.get("step"), {
      timeout: STEP_TIMEOUT,
    });

    // ─── Step 1: Your details ────────────────────────────────────────────────
    let step = expectStep(page, "applicant-details");
    await expect(page.locator("h1")).toContainText("Your details");
    await field(page, step, "applicant-first-name", data.firstName);
    await field(page, step, "applicant-last-name", data.lastName);
    // Masked NRN: type raw digits so Maskito formats to YYMMDD-NNNN.
    const nrn = page.locator(`input[id="${step}_national-id-number"]`);
    await nrn.pressSequentially(data.nrnDigits);
    await expect(nrn).toHaveValue(/^\d{6}-\d{4}$/);
    await afterField(page);
    await field(page, step, "applicant-address-line-1", data.addressLine1);
    await dropdown(page, step, "applicant-parish", data.applicantParish);
    await field(page, step, "mobile-number", data.mobile);
    await field(page, step, "email", data.applicantEmail);
    await advance(page, step);

    // ─── Step 2: The event organiser (is-organiser = no) ─────────────────────
    step = expectStep(page, "event-organiser");
    await radio(page, step, "is-organiser", "no");
    await field(page, step, "organiser-name", data.organiserName);
    await field(page, step, "organiser-phone", data.organiserPhone);
    await field(page, step, "organiser-email", data.organiserEmail);
    await advance(page, step);

    // ─── Step 3: About the event (geocoded address drives routing) ───────────
    step = expectStep(page, "event-details");
    await expect(page.locator("h1")).toContainText("About the event");
    await field(page, step, "event-name", data.eventName);
    const coordinates = await fillGeocodedEventAddress(
      page,
      step,
      data.eventAddress,
    );
    await afterField(page);
    if (logData)
      console.log(
        `[smoke-data] event address "${data.eventAddress}" → coordinates=${coordinates}`,
      );
    await dateField(
      page,
      step,
      "event-from",
      data.start.getDate(),
      data.start.getMonth() + 1,
      data.start.getFullYear(),
    );
    await dateField(
      page,
      step,
      "event-to",
      data.end.getDate(),
      data.end.getMonth() + 1,
      data.end.getFullYear(),
    );
    await field(page, step, "event-start-time", data.startTime);
    await field(page, step, "event-end-time", data.endTime);
    await advance(page, step);

    // ─── Step 4: Food and drink (checkbox-accordion) ─────────────────────────
    step = expectStep(page, "food-details");
    // Open the category, then tick one leaf item.
    await page.getByRole("checkbox", { name: RICE_GROUP_LABEL }).click();
    const leaf = page.getByRole("checkbox", {
      name: data.foodItem,
      exact: true,
    });
    await expect(leaf).toBeVisible({ timeout: STEP_TIMEOUT });
    await leaf.check();
    await afterField(page);

    // "Something else" → the `other` leaf reveals the required free-text field.
    await page.getByRole("checkbox", { name: OTHER_GROUP_LABEL }).click();
    const otherLeaf = page.getByRole("checkbox", {
      name: OTHER_ITEM_LABEL,
      exact: true,
    });
    await expect(otherLeaf).toBeVisible({ timeout: STEP_TIMEOUT });
    await otherLeaf.check();
    await field(page, step, "food-served-other", data.otherFood);

    // The supplier fields are gated behind food-from-supplier: absent until the
    // box is ticked, so assert that before ticking it and filling them in.
    const supplierName = page.locator(`[id="${step}_supplier-name"]`);
    await expect(supplierName).toBeHidden();
    await page.locator(`input[id="${step}_food-from-supplier-yes"]`).check();
    await expect(supplierName).toBeVisible({ timeout: STEP_TIMEOUT });
    await afterField(page);
    await field(page, step, "supplier-name", data.supplierName);
    await field(page, step, "supplier-address", data.supplierAddress);
    await field(page, step, "supplier-phone", data.supplierPhone);
    await field(page, step, "supplier-email", data.supplierEmail);
    await advance(page, step);

    // ─── Step 5: Food safety ─────────────────────────────────────────────────
    step = expectStep(page, "food-safety");
    await radio(page, step, "has-food-licence", "no");
    await field(page, step, "handlers-male", data.handlersMale);
    await field(page, step, "handlers-female", data.handlersFemale);
    await field(page, step, "water-source", data.waterSource);
    await field(page, step, "handwashing", data.handwashing);
    await field(page, step, "waste-disposal", data.wasteDisposal);
    await advance(page, step);

    // ─── Step 6: Supporting documents (only medical-certs required here) ─────
    step = expectStep(page, "documents");
    await uploadOne(page, step, "medical-certs", {
      name: TEST_PNG.name,
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await afterField(page);
    await advance(page, step);

    // ─── Check your answers (auto-injected) ──────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.eventName).first()).toBeVisible();
    await expect(page.getByText(data.applicantEmail).first()).toBeVisible();
    // Inspect the fully filled form WITHOUT creating a record: hold here, before
    // the declaration + real submit. Enable with SMOKE_HOLD_CYA=1; close the
    // window (don't resume) to end without submitting. No-op on normal/CI runs.
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    // ─── Declaration ─────────────────────────────────────────────────────────
    expectStep(page, "declaration");
    await page
      .getByRole("checkbox", {
        name: /I confirm that my information is correct/,
      })
      .check();
    await afterField(page);

    // ─── Submit + Submission Confirmation ────────────────────────────────────
    await submitAndConfirm(page, {
      heading: "Application submitted",
      referenceLabel: "Submission ID",
    });

    // Hold the browser open on the confirmation screen for manual inspection
    // (headed runs only). Enable with SMOKE_HOLD=1; page.pause() parks here with
    // the window open until you resume/close it. No-op on normal/CI runs.
    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
