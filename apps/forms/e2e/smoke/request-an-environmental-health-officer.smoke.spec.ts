/**
 * request-an-environmental-health-officer.smoke.spec.ts
 *
 * Live, on-demand smoke tests for the Request an Environmental Health Officer
 * service (formId `request-an-environmental-health-officer`).
 *
 * These drive the REAL deployed form (default: sandbox), fill every step with
 * valid @faker-js/faker data, SUBMIT FOR REAL, and assert the confirmation
 * screen is reached with a reference code.
 *
 * Like the other specs under e2e/smoke they run ONLY via
 * playwright.smoke.config.ts — the normal `test:e2e` / CI suite ignores this
 * directory (ADR 0027 / 0029), and no workflow runs them automatically.
 *
 * Run them on demand (from the repo root):
 *   SMOKE_BASE_URL=https://forms.sandbox.alpha.gov.bb PREVIEW_TOKEN=… \
 *     pnpm --filter @govtech-bb/forms exec playwright test \
 *     --config playwright.smoke.config.ts request-an-environmental-health-officer
 *
 * Useful env overrides:
 *   SMOKE_BASE_URL   target environment. REQUIRED — playwright.smoke.config.ts throws
 *                    without it, deliberately, so a real submission can never go to an
 *                    unintended environment by default. Use
 *                    https://forms.sandbox.alpha.gov.bb for sandbox.
 *   PREVIEW_TOKEN    forms preview secret — appended as ?preview=<token>. REQUIRED
 *                    while the recipe is visibility:draft, because a non-public
 *                    recipe 404s without a token. Pass it on the command line so
 *                    the secret never lands in the repo.
 *   SMOKE_SLOWMO     ms delay per action for watching a headed run.
 *   FAKER_SEED       fix faker's RNG for a reproducible data set.
 *
 * Form-specific notes:
 *  - The whole journey hinges on `operating-restaurant`. Answering "yes" adds the
 *    food-details and food-safety steps (stepConditionalOn), two more uploads and
 *    a third declaration checkbox. This spec covers "yes"; the sibling test in
 *    this file covers "no" and asserts the food steps are skipped.
 *  - There is no National Registration Number on this form (unlike the licence),
 *    so no Maskito-masked field to type digit-by-digit.
 *  - The event address is an address-lookup (geocoder) field, so it cannot take a
 *    free-text faker address — the geocoder must return a real Barbados match to
 *    populate the hidden coordinates the catchment router reads. We faker-pick
 *    from a pool of known-geocodable locations, select the first suggestion, then
 *    assert `event-address-coordinates` filled.
 *  - food-served is a checkbox-accordion: open a category, then tick one leaf.
 *    "Other food" is a single-option group, so it renders as one plain checkbox
 *    (no expander) and ticking it reveals the required other-food-description.
 *  - food-source is a TWO-option checkbox (values "supplier" and "caterer"), so
 *    the input ids are `<step>_food-source-supplier` / `-caterer`. It gates the
 *    supplier textarea and the caterer contact fields respectively.
 */
import { faker } from "@faker-js/faker";
import { test, expect, type Page } from "@playwright/test";
import {
  STEP_TIMEOUT,
  advance,
  expectLeadTimeWarningIsAdvisory,
  currentStep,
  expectStep,
  fillDate,
  fillField,
  selectDropdown,
  selectRadio,
  submitAndConfirm,
  uploadOne,
} from "../helpers/smoke";
import { TEST_PNG } from "../helpers/test-data";

export const FORM_ID = "request-an-environmental-health-officer";

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
 * a suggestion is picked — so the event address is chosen from this pool.
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
const OTHER_LABEL = "Other food";

/** Build a complete, valid set of answers for either branch. */
export function buildData() {
  if (process.env.FAKER_SEED) faker.seed(Number(process.env.FAKER_SEED));

  // Keep the start >= 14 days out so the soft lead-time warning stays hidden
  // (it is advisory, not blocking); end date is the same day or a few later.
  const start = new Date();
  start.setDate(start.getDate() + faker.number.int({ min: 21, max: 120 }));
  const end = new Date(start);
  end.setDate(end.getDate() + faker.number.int({ min: 0, max: 4 }));

  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    addressLine1: faker.location.streetAddress(),
    applicantParish: faker.helpers.arrayElement(PARISH_VALUES),
    mobile: bbMobileNumber(),
    // Goes to the monitored test inbox so a real run is verifiable end-to-end.
    applicantEmail: "testing@govtech.bb",

    // Timestamped so the resulting submission is easy to find in the target env.
    eventName: `Smoke Test — ${faker.company.buzzNoun()} festival ${new Date().toISOString()}`,
    eventAddress: faker.helpers.arrayElement(GEOCODABLE_EVENT_ADDRESSES),
    start,
    end,
    startTime: "16:00",
    endTime: "22:00",
    numPatrons: String(faker.number.int({ min: 50, max: 900 })),
    numStalls: String(faker.number.int({ min: 1, max: 20 })),

    foodItem: faker.helpers.arrayElement(RICE_ITEMS),
    otherFood: `${faker.commerce.productName()} (smoke test)`,
    supplierDetails: "Fish from Oistins market; dry goods from a wholesaler",

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
export async function fillGeocodedEventAddress(
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

/** Steps 1–3, identical on both branches apart from the gate answer. */
export async function fillGateApplicantAndEvent(
  page: Page,
  data: ReturnType<typeof buildData>,
  operating: "yes" | "no",
): Promise<void> {
  let step = expectStep(page, "operating-restaurant");
  await selectRadio(page, step, "operating-restaurant", operating);
  await advance(page, step);

  step = expectStep(page, "applicant-details");
  await expect(page.locator("h1")).toContainText("Your details");
  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-last-name", data.lastName);
  await fillField(page, step, "applicant-address-line-1", data.addressLine1);
  await selectDropdown(page, step, "applicant-parish", data.applicantParish);
  await fillField(page, step, "mobile-number", data.mobile);
  await fillField(page, step, "email", data.applicantEmail);
  await advance(page, step);

  step = expectStep(page, "event-details");
  await expect(page.locator("h1")).toContainText("About the event");
  await fillField(page, step, "event-name", data.eventName);
  await fillGeocodedEventAddress(page, step, data.eventAddress);
  await fillDate(
    page,
    step,
    "event-from",
    data.start.getDate(),
    data.start.getMonth() + 1,
    data.start.getFullYear(),
  );
  await fillDate(
    page,
    step,
    "event-to",
    data.end.getDate(),
    data.end.getMonth() + 1,
    data.end.getFullYear(),
  );
  await fillField(page, step, "event-start-time", data.startTime);
  await fillField(page, step, "event-end-time", data.endTime);
  await fillField(page, step, "num-patrons", data.numPatrons);
  await fillField(page, step, "num-stalls", data.numStalls);
  await expectLeadTimeWarningIsAdvisory(page, step, data.start);
  await advance(page, step);
}

test.describe("Request an Environmental Health Officer — Live Smoke", () => {
  test("submits the serving-food branch end-to-end and reaches the confirmation screen", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillGateApplicantAndEvent(page, data, "yes");

    // ─── Food and drink (checkbox-accordion) ─────────────────────────────────
    let step = expectStep(page, "food-details");
    await page.getByRole("checkbox", { name: RICE_GROUP_LABEL }).click();
    const leaf = page.getByRole("checkbox", {
      name: data.foodItem,
      exact: true,
    });
    await expect(leaf).toBeVisible({ timeout: STEP_TIMEOUT });
    await leaf.check();

    // "Other food" is a single-option group: one plain checkbox, no expander.
    await page
      .getByRole("checkbox", { name: OTHER_LABEL, exact: true })
      .check();
    await fillField(page, step, "other-food-description", data.otherFood);

    // food-source gates the supplier textarea: absent until the box is ticked.
    const supplierDetails = page.locator(`[id="${step}_supplier-details"]`);
    await expect(supplierDetails).toBeHidden();
    await page.locator(`input[id="${step}_food-source-supplier"]`).check();
    await expect(supplierDetails).toBeVisible({ timeout: STEP_TIMEOUT });
    await fillField(page, step, "supplier-details", data.supplierDetails);
    await advance(page, step);

    // ─── Food safety ─────────────────────────────────────────────────────────
    step = expectStep(page, "food-safety");
    await selectRadio(page, step, "has-food-licence", "no");
    await fillField(page, step, "handlers-male", data.handlersMale);
    await fillField(page, step, "handlers-female", data.handlersFemale);
    await fillField(page, step, "water-source", data.waterSource);
    await fillField(page, step, "handwashing", data.handwashing);
    await fillField(page, step, "waste-disposal", data.wasteDisposal);
    await advance(page, step);

    // ─── Supporting documents (two required on this branch) ──────────────────
    // The site plan is optional for everyone now, but it is still accepted and
    // a real organiser would send one — so this branch keeps uploading it and
    // the "no" branch below covers omitting it.
    step = expectStep(page, "documents");
    await uploadOne(page, step, "vendor-list", {
      name: "vendor-list.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await uploadOne(page, step, "site-plan", {
      name: "site-plan.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await uploadOne(page, step, "medical-certs", {
      name: "medical-cert.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    await expect(page.getByText(data.eventName).first()).toBeVisible();
    if (process.env.SMOKE_HOLD_CYA) await page.pause();
    await advance(page, step);

    // ─── Declaration: three boxes on this branch ─────────────────────────────
    expectStep(page, "declaration");
    await page
      .getByRole("checkbox", {
        name: /I confirm that my information is correct/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /Health Services \(Restaurants\) Regulations, 1969/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /responsible for the overtime costs/,
      })
      .check();

    await submitAndConfirm(page, {
      heading: "Request submitted",
      referenceLabel: "Submission ID",
    });

    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("skips the food steps and submits when not operating a temporary restaurant", async ({
    page,
  }) => {
    const data = buildData();
    if (process.env.SMOKE_LOG_DATA)
      console.log("[smoke-data]", JSON.stringify(data, null, 2));

    await openForm(page);
    await fillGateApplicantAndEvent(page, data, "no");

    // The gate's whole purpose: food-details and food-safety are absent from the
    // journey, so leaving event-details lands directly on documents.
    const afterEvent = currentStep(page);
    expect(
      afterEvent,
      "answering no to operating-restaurant must skip food-details",
    ).not.toContain("food-details");
    expect(
      afterEvent,
      "answering no to operating-restaurant must skip food-safety",
    ).not.toContain("food-safety");

    // ─── Supporting documents (only the vendor list is required here) ────────
    let step = expectStep(page, "documents");
    await uploadOne(page, step, "vendor-list", {
      name: "vendor-list.png",
      mimeType: TEST_PNG.mimeType,
      buffer: TEST_PNG.buffer,
    });
    // The site plan is optional for everyone, so this branch deliberately
    // leaves it empty — the step must still advance. Its label carries the
    // "(optional)" suffix that tells the applicant so.
    await expect(page.locator(`label[for="${step}_site-plan"]`)).toContainText(
      "(optional)",
    );
    // The medical certificate and food licence are gated on the yes branch, so
    // neither should be on the page at all here.
    await expect(
      page.locator(`input[id="${step}_medical-certs"]`),
    ).toBeHidden();
    await expect(page.locator(`input[id="${step}_food-licence"]`)).toBeHidden();
    await advance(page, step);

    // ─── Check your answers ──────────────────────────────────────────────────
    step = expectStep(page, "check-your-answers");
    await expect(page.locator("h1")).toContainText("Check your answers");
    // The skipped steps must not appear in the review either.
    await expect(page.getByText("Water source")).toHaveCount(0);
    await advance(page, step);

    // ─── Declaration: only two boxes on this branch ──────────────────────────
    expectStep(page, "declaration");
    await expect(
      page.getByRole("checkbox", {
        name: /Health Services \(Restaurants\) Regulations, 1969/,
      }),
    ).toBeHidden();
    await page
      .getByRole("checkbox", {
        name: /I confirm that my information is correct/,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: /responsible for the overtime costs/,
      })
      .check();

    await submitAndConfirm(page, {
      heading: "Request submitted",
      referenceLabel: "Submission ID",
    });

    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
