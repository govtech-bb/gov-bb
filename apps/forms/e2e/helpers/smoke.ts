/**
 * smoke.ts — shared helpers for the live, on-demand smoke specs under
 * `e2e/smoke/`.
 *
 * The three smoke specs (temp-teacher, term-leave, vendor-registration) drive
 * real deployed forms the same way: land on the first step, walk each step
 * filling fields addressed as `${stepId}_${fieldId}`, advance on the primary
 * button, then submit for real and assert the confirmation screen. That shared
 * shape lives here so each spec carries only its form-specific body (field IDs,
 * step order, masks, repeatables, conditionals).
 *
 * These run ONLY via playwright.smoke.config.ts — never the mocked `test:e2e`
 * suite (see ADR 0027 / 0029).
 *
 * Field-ID scheme (confirmed against the running renderer):
 *   text/textarea : `${stepId}_${fieldId}`
 *   date parts    : `${stepId}_${fieldId}-day` / `-month` / `-year`
 *   radio option  : `${stepId}_${fieldId}-${optionValue}`  (e.g. gender-female)
 *   checkbox opt  : `${stepId}_${fieldId}-${optionValue}`
 *   file          : `${stepId}_${fieldId}`
 */
import { expect, type Page, type Response } from "@playwright/test";

export const STEP_TIMEOUT = 15_000;
const UPLOAD_TIMEOUT = 30_000;

/**
 * The primary action button advances every step ("Continue", "Submit" on the
 * declaration). Matched by role + accessible name so it stays robust to
 * design-system styling changes, and so "Previous" is never matched.
 */
const primaryButton = (page: Page) =>
  page.getByRole("button", { name: /^(Continue|Submit)$/ });

/** Read the current `?step=` param. */
export function currentStep(page: Page): string {
  return new URL(page.url()).searchParams.get("step") ?? "";
}

/**
 * Assert we're on the expected step and return the live step ID (used to build
 * field IDs). By default `step` is matched as a substring — robust to a
 * deployment that renumbers its data steps (e.g. `step-1-basic-info` vs the
 * recipe's bare `basic-info`). Pass `{ exact: true }` when the step ID is
 * stable and an exact match is wanted.
 */
export function expectStep(
  page: Page,
  step: string,
  opts: { exact?: boolean } = {},
): string {
  const current = currentStep(page);
  if (opts.exact) {
    expect(current, `expected to be on step "${step}"`).toBe(step);
  } else {
    expect(current, `expected to be on a step containing "${step}"`).toContain(
      step,
    );
  }
  return current;
}

/** Click the primary button and wait until `?step=` changes away from `fromStep`. */
export async function advance(page: Page, fromStep: string): Promise<void> {
  await primaryButton(page).click();
  await page.waitForURL((url) => url.searchParams.get("step") !== fromStep, {
    timeout: STEP_TIMEOUT,
  });
}

/** Click "Previous" and wait until `?step=` changes away from `fromStep`. */
export async function goBack(page: Page, fromStep: string): Promise<void> {
  await page.getByRole("button", { name: /^Previous$/ }).click();
  await page.waitForURL((url) => url.searchParams.get("step") !== fromStep, {
    timeout: STEP_TIMEOUT,
  });
}

/**
 * Assert the event start date's three rules, which are easy to confuse:
 *   1. today → 13 days out → soft warning shows, and the step STILL ADVANCES
 *      (this replaced a hard `min: daysUntil 14` that refused the whole form),
 *   2. in the past        → hard error ONLY, and the step does not advance,
 *   3. 14+ days out       → the warning clears.
 *
 * Rule 2 is why the warning carries a `gte 0` bound as well as `lt 14`: a past
 * date is also "fewer than 14 days", so without the floor it would draw the
 * advisory callout alongside the blocking error and muddle which one to act on.
 *
 * Call this with every other field on the step already filled — the advance
 * would otherwise fail on an unrelated required field and read as a false pass
 * of the old blocking behaviour. Leaves the field on `compliantStart`, so the
 * run submits the same data it would have without this check.
 */
export async function expectLeadTimeWarningIsAdvisory(
  page: Page,
  stepId: string,
  compliantStart: Date,
): Promise<void> {
  const soon = new Date();
  soon.setDate(soon.getDate() + 4);
  await fillDate(
    page,
    stepId,
    "event-from",
    soon.getDate(),
    soon.getMonth() + 1,
    soon.getFullYear(),
  );

  const warning = page.locator(".govbb-warning-text");
  await expect(warning).toContainText("fewer than 14 days", {
    timeout: STEP_TIMEOUT,
  });

  // The regression this guards: a short-notice event used to be refused here.
  await advance(page, stepId);
  await goBack(page, currentStep(page));
  expectStep(page, stepId, { exact: true });

  // The floor that DID survive: yesterday is still refused outright, so the
  // soft warning cannot be mistaken for "any date goes".
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await fillDate(
    page,
    stepId,
    "event-from",
    yesterday.getDate(),
    yesterday.getMonth() + 1,
    yesterday.getFullYear(),
  );
  await page.getByRole("button", { name: /^Continue$/ }).click();
  await expect(page.locator(".govbb-error-summary")).toContainText(
    "cannot be in the past",
    { timeout: STEP_TIMEOUT },
  );
  expectStep(page, stepId, { exact: true });
  // The error stands alone — a past date gets one instruction, not two.
  await expect(warning).toBeHidden();

  // Today is the boundary the floor allows: valid, but still short notice, so
  // the warning is back and nothing blocks.
  const today = new Date();
  await fillDate(
    page,
    stepId,
    "event-from",
    today.getDate(),
    today.getMonth() + 1,
    today.getFullYear(),
  );
  await expect(warning).toBeVisible({ timeout: STEP_TIMEOUT });
  await expect(page.locator(".govbb-error-summary")).toBeHidden();

  await fillDate(
    page,
    stepId,
    "event-from",
    compliantStart.getDate(),
    compliantStart.getMonth() + 1,
    compliantStart.getFullYear(),
  );
  await expect(warning).toBeHidden({ timeout: STEP_TIMEOUT });
}

/** Fill a text/textarea input addressed as `${stepId}_${suffix}`. */
export async function fillField(
  page: Page,
  stepId: string,
  suffix: string,
  value: string,
): Promise<void> {
  await page.locator(`[id="${stepId}_${suffix}"]`).fill(value);
}

/** Fill a three-part date field (`-day` / `-month` / `-year`). */
export async function fillDate(
  page: Page,
  stepId: string,
  suffix: string,
  day: number,
  month: number,
  year: number,
): Promise<void> {
  const base = `${stepId}_${suffix}`;
  await page.locator(`input[id="${base}-day"]`).fill(String(day));
  await page.locator(`input[id="${base}-month"]`).fill(String(month));
  await page.locator(`input[id="${base}-year"]`).fill(String(year));
}

/** Choose an option in a native `<select>` dropdown addressed as `${stepId}_${suffix}`. */
export async function selectDropdown(
  page: Page,
  stepId: string,
  suffix: string,
  value: string,
): Promise<void> {
  await page.locator(`select[id="${stepId}_${suffix}"]`).selectOption(value);
}

/** Select a radio option by its value suffix (`gender-female`, `addAnother-no`). */
export async function selectRadio(
  page: Page,
  stepId: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(`input[type=radio][id="${stepId}_${suffix}-${optionValue}"]`)
    .check();
}

/**
 * Upload one file to a single-file upload field and wait until the upload is
 * CONFIRMED, not merely pending. The component renders a file's name for both
 * the "Uploading…" pending row and the confirmed row, so waiting on the name
 * alone can resolve before `confirm-upload` commits the value (and advancing
 * then trips minItems validation). The per-file "Remove {name}" button only
 * renders for a confirmed file, so wait on that instead.
 */
export async function uploadOne(
  page: Page,
  stepId: string,
  suffix: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page
    .locator(`input[type=file][id="${stepId}_${suffix}"]`)
    .setInputFiles(file);
  await expect(
    page.getByRole("button", { name: `Remove ${file.name}` }),
  ).toBeVisible({ timeout: UPLOAD_TIMEOUT });
}

/**
 * Upload several files to a multi-file upload field and wait until EVERY file
 * is CONFIRMED. The widget is NOT an `<input multiple>` — it's a single
 * (non-multiple) file input you reuse to add files one at a time, so each file
 * must be set in its own `setInputFiles` call and confirmed (its "Remove
 * {name}" button visible) before adding the next; passing an array at once
 * fails with "Non-multiple file input can only accept single file". Advancing
 * before all files commit trips the field's `minItems` validation (e.g. a "2
 * photos" field rejecting a single file). Files must have distinct names so
 * each "Remove {name}" button is uniquely addressable.
 */
export async function uploadMany(
  page: Page,
  stepId: string,
  suffix: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> {
  for (const file of files) {
    await page
      .locator(`input[type=file][id="${stepId}_${suffix}"]`)
      .setInputFiles(file);
    await expect(
      page.getByRole("button", { name: `Remove ${file.name}` }),
    ).toBeVisible({ timeout: UPLOAD_TIMEOUT });
  }
}

/**
 * Submit the form for real and assert the confirmation screen.
 *
 * Waits for the real `POST /submissions` call to return 2xx, then waits for the
 * `submission-confirmation` step, asserts the confirmation heading and the
 * "saved" message. When `referenceLabel` is given, also asserts the reference
 * label is shown and that the id returned by the API is rendered on the page.
 *
 * The submission-response wait is intentionally NOT capped at STEP_TIMEOUT — it
 * uses Playwright's global test timeout. A real submission against a freshly
 * deployed/cold backend can take longer than a step navigation, and capping it
 * tighter only invites flakiness on the one step that has a real side effect.
 *
 * Returns the submission Response so callers can inspect it further if needed.
 */
export async function submitAndConfirm(
  page: Page,
  opts: {
    heading: string | RegExp;
    /**
     * The subheading shown under the title. Defaults to the generic
     * "Your submission has been saved" fallback; forms whose recipe sets a
     * confirmation-step `description` (e.g. temp-teacher) pass their own copy.
     */
    subheading?: string | RegExp;
    referenceLabel?: string | RegExp;
  },
): Promise<Response> {
  // Assert the real submission API call succeeds (HTTP 2xx) on submit.
  const submissionResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/submissions") && res.request().method() === "POST",
  );
  await primaryButton(page).click();

  const response = await submissionResponse;
  expect(
    response.ok(),
    `POST /submissions failed with ${response.status()}`,
  ).toBe(true);

  await page.waitForURL(
    (url) => url.searchParams.get("step") === "submission-confirmation",
    { timeout: STEP_TIMEOUT },
  );
  await expect(page.locator("h1")).toContainText(opts.heading);
  await expect(
    page.getByText(opts.subheading ?? "Your submission has been saved"),
  ).toBeVisible();

  if (opts.referenceLabel) {
    await expect(page.getByText(opts.referenceLabel)).toBeVisible();
    // The API returns a human-readable referenceCode (e.g.
    // "BYAC-2606-Y5RPJEP"). Fall back to `id` (UUID) for older API
    // deploys that don't yet include referenceCode (see issue #791).
    const body = await response.json();
    const referenceCode: string | undefined =
      body?.data?.referenceCode ?? body?.referenceCode;
    const referenceId: string | undefined = body?.data?.id ?? body?.id;
    const renderedReference = referenceCode ?? referenceId;
    expect(
      renderedReference,
      "submission response should include a reference code or id",
    ).toBeTruthy();
    if (referenceCode) {
      // When the API returns a referenceCode, it should match the canonical
      // shape (#1468): <PREFIX>-<YYMM>-<7 Crockford-Base32 chars>. Crockford
      // omits I, L, O, U so the code survives being read aloud and retyped.
      //
      // The prefix is one segment when it is derived from the formId initials
      // (RAEHO), and TWO when the recipe declares an MDA prefix (#2331:
      // `mdaCode`-`programmeShortCode`, e.g. MOH-EHO). Both are canonical —
      // a single-segment-only pattern rejects every MDA-migrated form.
      expect(
        referenceCode,
        "referenceCode should match the expected pattern",
      ).toMatch(/^[A-Z]+(-[A-Z]+)?-\d{4}-[0-9A-HJKMNP-TV-Z]{7}$/);
    }
    await expect(page.getByText(String(renderedReference))).toBeVisible();
  }

  return response;
}
