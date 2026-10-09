/**
 * apply-for-offensive-matter-licence.smoke.spec.ts
 *
 * Live, on-demand smoke test for the offensive matter licence service
 * (formId `apply-for-offensive-matter-licence`, titled "Apply to Environmental
 * Health for an offensive matter licence to move sewage and other harmful
 * waste").
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
 *  - Steps: `applying-for`, `personal-and-contact-details`, then ONE of
 *    `person-details` (applying-for = another-person) or `business-details`
 *    (= business), then `operator-address` and the repeatable
 *    `vehicle-details`, then the platform's `check-your-answers` /
 *    `declaration` / `submission-confirmation`. One test per `applying-for`
 *    answer, so each conditional step is walked once.
 *  - `has-permission` sits on the `applying-for` step and only shows for
 *    another person or a business. It is gated with `pattern: ^yes$`, so "No"
 *    blocks the step; the business test asserts that before answering "Yes".
 *  - `operator-address` is the step the catchment routes on, for every branch
 *    (`catchmentRouting` = `operator-address.operator-address-coordinates` /
 *    `operator-parish`). Its line 1 is the address-lookup (geocoder), so it
 *    cannot take a free-text faker address: we pick from a pool of
 *    known-geocodable locations, select the first suggestion, then assert the
 *    hidden coordinates filled. That field renders as an `input[type=hidden]`,
 *    so assert its VALUE — never its visibility.
 *  - New or renewal is asked PER VEHICLE on `vehicle-details`. `current-licence`
 *    is revealed by `application-type` = "renew" with no `targetStepId`, so the
 *    condition is local to each vehicle instance: the two-vehicle test renews
 *    vehicle 1 and applies new for vehicle 2, and asserts the licence number
 *    field is hidden on vehicle 2. The value is "renew", not "renewal" as on
 *    the sibling offensive-waste recipe.
 *  - `vehicle-details` is a repeatable step (min 1, max 20) with no
 *    sharedFields, so the base step IS vehicle 1 and carries the injected
 *    `addAnother` radio. Vehicle 2 lands on `vehicle-details~1`. The step sets
 *    `instanceLabel: "Vehicle"`, so match the h1 loosely.
 *  - `applicant-telephone` is a `fieldArray` (min 1, max 3). Row 0 keeps the
 *    unsuffixed id; rows 1+ are index-suffixed (`…_applicant-telephone-1`) and
 *    added with the "Add Another Telephone number" button. It validates with
 *    libphonenumber-js, so every row needs a real Barbados exchange.
 *  - The confirmation `markdownContent` carries `{polyclinic}`, substituted
 *    with the catchment resolved from the operator address. We assert a real
 *    polyclinic name and that the "your local polyclinic" fallback is absent,
 *    because that fallback means the MDA's copy of the application went
 *    nowhere.
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
 * a suggestion is picked — so the OPERATOR address is chosen from this pool.
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

    personFirstName: faker.person.firstName(),
    personLastName: faker.person.lastName(),

    // Timestamped so the resulting submission is easy to find in the target env.
    businessName: `Smoke Test Carrier ${new Date().toISOString()}`,
    businessRelationship: "Manager",

    // The OPERATOR address is the one the catchment routes on, so it has to be
    // geocodable — a free-text address would resolve to no polyclinic.
    operatorAddress: faker.helpers.arrayElement(GEOCODABLE_ADDRESSES),
    operatorAddressLine2: faker.location.street(),

    currentLicence: `OM/${faker.string.numeric(5)}`,
    firstVehicle: vehicleRegistration(),
    secondVehicle: vehicleRegistration(),
  };
}

type Data = ReturnType<typeof buildData>;
type ApplyingFor = "yourself" | "another-person" | "business";

/** Open the form at its first step, carrying the preview token when supplied. */
export async function openForm(page: Page): Promise<void> {
  await openSmokeForm(page, FORM_ID);
  await page.waitForURL((url) => !!url.searchParams.get("step"), {
    timeout: STEP_TIMEOUT,
  });
}

/**
 * Step 1 — who the licence is for. `has-permission` only shows for another
 * person or a business, and its `^yes$` pattern blocks a "No". With
 * `checkRefusal`, assert that block before answering "Yes".
 */
export async function fillApplyingFor(
  page: Page,
  applyingFor: ApplyingFor,
  opts: { checkRefusal?: boolean } = {},
): Promise<void> {
  const step = expectStep(page, "applying-for");
  await expect(page.locator("h1")).toContainText("Who are you applying for?");

  const permission = page.locator(`fieldset[id="${step}_has-permission"]`);
  await expect(permission).toBeHidden();

  await selectRadio(page, step, "applying-for", applyingFor);

  if (applyingFor === "yourself") {
    await expect(permission).toBeHidden();
  } else {
    await expect(permission).toBeVisible({ timeout: STEP_TIMEOUT });
    if (opts.checkRefusal) {
      await selectRadio(page, step, "has-permission", "no");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page
          .getByText(
            "You need permission from the person or business before you can apply.",
          )
          .first(),
      ).toBeVisible({ timeout: STEP_TIMEOUT });
      expectStep(page, "applying-for");
    }
    await selectRadio(page, step, "has-permission", "yes");
  }

  await advance(page, step);
}

/**
 * Step 2 — the applicant. `applicant-telephone` is a fieldArray: row 0 keeps
 * the unsuffixed id, and `secondPhone` (when given) clicks "Add Another
 * Telephone number" and fills the `-1` row.
 */
export async function fillYourDetails(
  page: Page,
  data: Data,
  opts: { secondPhone?: boolean } = {},
): Promise<void> {
  const step = expectStep(page, "personal-and-contact-details");
  await expect(page.locator("h1")).toContainText("Your details");

  await fillField(page, step, "applicant-first-name", data.firstName);
  await fillField(page, step, "applicant-middle-name", data.middleName);
  await fillField(page, step, "applicant-last-name", data.lastName);

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

  await fillField(page, step, "applicant-email", data.email);
  await expect(
    page.getByRole("heading", { name: "Your address" }),
  ).toBeVisible();
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

  await advance(page, step);
}

/** Step 3a — only when applying for another person. */
export async function fillPersonDetails(page: Page, data: Data): Promise<void> {
  const step = expectStep(page, "person-details");
  await expect(page.locator("h1")).toContainText(
    "Tell us about the person you are applying for",
  );
  await fillField(page, step, "person-first-name", data.personFirstName);
  await fillField(page, step, "person-last-name", data.personLastName);
  await advance(page, step);
}

/** Step 3b — only when applying for a business. */
export async function fillBusinessDetails(
  page: Page,
  data: Data,
): Promise<void> {
  const step = expectStep(page, "business-details");
  await expect(page.locator("h1")).toContainText("Tell us about the business");
  await fillField(page, step, "business-name", data.businessName);
  await fillField(
    page,
    step,
    "business-relationship",
    data.businessRelationship,
  );
  await advance(page, step);
}

/**
 * Step 4 — where the business or operator is located. This is the step the
 * catchment routes on for every branch, so the geocoder MUST resolve: the
 * helper asserts the hidden coordinates filled rather than soft-skipping,
 * because an empty one means the submission reaches no polyclinic at all.
 */
export async function fillOperatorAddress(
  page: Page,
  data: Data,
): Promise<string> {
  const step = expectStep(page, "operator-address");
  await expect(page.locator("h1")).toContainText(
    "Where is the business or operator located?",
  );

  const coordinates = await fillGeocodedAddress(
    page,
    step,
    {
      lineFieldId: "operator-address-line-1",
      coordinatesFieldId: "operator-address-coordinates",
    },
    data.operatorAddress,
  );
  // Line 2 is optional and a suggestion does not always carry one (Holetown
  // resolves with it empty) — overwrite so the submitted record is deterministic.
  await fillField(
    page,
    step,
    "operator-address-line-2",
    data.operatorAddressLine2,
  );
  // The geocoder fills the parish from the picked suggestion; assert rather than
  // overwrite, since that value is the catchment router's fallback.
  await expect(
    page.locator(`select[id="${step}_operator-parish"]`),
  ).not.toHaveValue("");

  await advance(page, step);
  return coordinates;
}

/**
 * Step 5 — one instance of the repeatable vehicle step, with its own new or
 * renewal answer. `stepId` is passed in rather than derived, because vehicle 2
 * lives on `vehicle-details~1`.
 */
export async function fillVehicleDetails(
  page: Page,
  stepId: string,
  vehicle: {
    registration: string;
    applicationType: "new" | "renew";
    currentLicence?: string;
  },
  addAnother: "yes" | "no",
): Promise<void> {
  await expect(page.locator("h1")).toContainText("Tell us about the vehicle");

  const currentLicence = page.locator(`[id="${stepId}_current-licence"]`);
  await expect(currentLicence).toBeHidden();

  await selectRadio(page, stepId, "application-type", vehicle.applicationType);
  if (vehicle.applicationType === "renew") {
    await expect(currentLicence).toBeVisible({ timeout: STEP_TIMEOUT });
    if (vehicle.currentLicence)
      await currentLicence.fill(vehicle.currentLicence);
  } else {
    // Instance-local: another vehicle's "renew" must not reveal it here.
    await expect(currentLicence).toBeHidden();
  }

  await fillField(
    page,
    stepId,
    "vehicle-registration-number",
    vehicle.registration,
  );
  await selectRadio(page, stepId, "addAnother", addAnother);
  await advance(page, stepId);
}

/** Fill "Your agreement" and submit for real. */
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
    page.getByRole("heading", { name: "What happens next" }),
  ).toBeVisible();
  // `{polyclinic}` is substituted with the catchment resolved from the geocoded
  // operator address. The generic "your local polyclinic" fallback means
  // resolution failed, which would also mean the polyclinic never got its copy
  // of the application — so assert a real name rather than just the copy.
  await expect(page.getByText(/Environmental Health/).first()).toBeVisible();
  await expect(page.getByText(/Polyclinic|Complex/).first()).toBeVisible();
  await expect(page.getByText("your local polyclinic")).toHaveCount(0);
}

/** Pass "Check your answers", logging the routed coordinate when asked. */
async function passCheckYourAnswers(
  page: Page,
  coordinates: string,
): Promise<void> {
  const step = expectStep(page, "check-your-answers");
  await expect(page.locator("h1")).toContainText("Check your answers");
  if (process.env.SMOKE_LOG_DATA)
    console.log("[smoke-data] operator coordinates:", coordinates);
  if (process.env.SMOKE_HOLD_CYA) await page.pause();
  await advance(page, step);
}

function logData(data: Data): void {
  if (process.env.SMOKE_LOG_DATA)
    console.log("[smoke-data]", JSON.stringify(data, null, 2));
}

test.describe("Offensive Matter Licence — Live Smoke", () => {
  test("applying for yourself: a new licence for one vehicle", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplyingFor(page, "yourself");
    await fillYourDetails(page, data);
    // Neither conditional step is shown for "yourself".
    const coordinates = await fillOperatorAddress(page, data);

    const vehicleStep = expectStep(page, "vehicle-details");
    await fillVehicleDetails(
      page,
      vehicleStep,
      { registration: data.firstVehicle, applicationType: "new" },
      "no",
    );

    await expect(page.getByText(data.firstVehicle).first()).toBeVisible();
    // A new licence was never asked for a licence number.
    await expect(page.getByText(data.currentLicence)).toHaveCount(0);
    await expect(page.getByText(data.secondVehicle)).toHaveCount(0);
    await passCheckYourAnswers(page, coordinates);

    await agreeAndSubmit(page, data);
    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("applying for another person: one renewal and one new vehicle", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplyingFor(page, "another-person");
    // A second fieldArray row — both numbers must survive to the review.
    await fillYourDetails(page, data, { secondPhone: true });
    await fillPersonDetails(page, data);
    const coordinates = await fillOperatorAddress(page, data);

    // ─── Vehicles — "yes" to addAnother materialises a second instance ──────
    const firstVehicleStep = expectStep(page, "vehicle-details");
    await fillVehicleDetails(
      page,
      firstVehicleStep,
      {
        registration: data.firstVehicle,
        applicationType: "renew",
        currentLicence: data.currentLicence,
      },
      "yes",
    );

    const secondVehicleStep = expectStep(page, "vehicle-details");
    expect(
      secondVehicleStep,
      "answering yes to addAnother must open a new vehicle instance",
    ).not.toBe(firstVehicleStep);
    await fillVehicleDetails(
      page,
      secondVehicleStep,
      { registration: data.secondVehicle, applicationType: "new" },
      "no",
    );

    await expect(page.getByText(data.personLastName).first()).toBeVisible();
    await expect(page.getByText(data.currentLicence).first()).toBeVisible();
    await expect(page.getByText(data.phone).first()).toBeVisible();
    await expect(page.getByText(data.secondPhone).first()).toBeVisible();
    await expect(page.getByText(data.firstVehicle).first()).toBeVisible();
    await expect(page.getByText(data.secondVehicle).first()).toBeVisible();
    await passCheckYourAnswers(page, coordinates);

    await agreeAndSubmit(page, data);
    if (process.env.SMOKE_HOLD) await page.pause();
  });

  test("applying for a business: permission is required, then a renewal", async ({
    page,
  }) => {
    const data = buildData();
    logData(data);

    await openForm(page);
    await fillApplyingFor(page, "business", { checkRefusal: true });
    await fillYourDetails(page, data);
    await fillBusinessDetails(page, data);
    const coordinates = await fillOperatorAddress(page, data);

    const vehicleStep = expectStep(page, "vehicle-details");
    await fillVehicleDetails(
      page,
      vehicleStep,
      {
        registration: data.firstVehicle,
        applicationType: "renew",
        currentLicence: data.currentLicence,
      },
      "no",
    );

    await expect(page.getByText(data.businessName).first()).toBeVisible();
    await expect(page.getByText(data.currentLicence).first()).toBeVisible();
    await passCheckYourAnswers(page, coordinates);

    await agreeAndSubmit(page, data);
    if (process.env.SMOKE_HOLD) await page.pause();
  });
});
