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
 * The smoke SPECS run ONLY via playwright.smoke.config.ts — never the mocked
 * `test:e2e` suite (see ADR 0027 / 0029). The upload helpers below are also
 * tested in that mocked suite (e2e/upload-helpers.spec.ts, #2423), so keep
 * this file free of anything that needs a live environment to import.
 *
 * Field-ID scheme (confirmed against the running renderer):
 *   text/textarea : `${stepId}_${fieldId}`
 *   date parts    : `${stepId}_${fieldId}-day` / `-month` / `-year`
 *   radio/checkbox: fieldset `${stepId}_${fieldId}`, then native option value
 *   file          : `${stepId}_${fieldId}`
 */
import {
  errors,
  expect,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

export const STEP_TIMEOUT = 15_000;
const UPLOAD_TIMEOUT = 30_000;

/**
 * The primary action button advances every step ("Continue", "Submit" on the
 * declaration). Matched by role + accessible name so it stays robust to
 * design-system styling changes, and so "Previous" is never matched.
 */
const primaryButton = (page: Page) =>
  page.getByRole("button", { name: /^(Continue|Submit)$/ });

/** Open a published recipe, including private forms when a preview token is set. */
export async function openSmokeForm(page: Page, formId: string): Promise<void> {
  const previewToken = process.env.PREVIEW_TOKEN;
  const search = previewToken
    ? `?preview=${encodeURIComponent(previewToken)}`
    : "";
  await page.goto(`/forms/${formId}${search}`);
}

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

/** Select an option by its field and value; input IDs belong to the package. */
export async function selectRadio(
  page: Page,
  stepId: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(
      `fieldset[id="${stepId}_${suffix}"] input[type=radio][value="${optionValue}"]`,
    )
    .check();
}

/** Tick a checkbox option by its field and value. */
export async function tickCheckbox(
  page: Page,
  stepId: string,
  suffix: string,
  optionValue: string,
): Promise<void> {
  await page
    .locator(
      `fieldset[id="${stepId}_${suffix}"] input[type=checkbox][value="${optionValue}"]`,
    )
    .check();
}

/**
 * Canned `/geocode` answers for the places the smoke specs type. Real Barbados
 * coordinates, each checked against `polyclinic-catchments.geojson`, so
 * catchment routing still resolves a real polyclinic — Gun Hill sits in the
 * Frederick Miller polygon that eho-frederick-miller-local depends on.
 */
const MOCK_GEOCODE_PLACES: Record<
  string,
  {
    label: string;
    lat: string;
    lon: string;
    line1: string;
    line2: string;
    parish: string;
  }
> = {
  "jemmotts lane": {
    label: "Jemmotts Lane, Bridgetown, Saint Michael, Barbados",
    lat: "13.0935",
    lon: "-59.6050",
    line1: "Jemmotts Lane",
    line2: "Bridgetown",
    parish: "st-michael",
  },
  "broad street": {
    label: "Broad Street, Bridgetown, Saint Michael, Barbados",
    lat: "13.0967",
    lon: "-59.6142",
    line1: "Broad Street",
    line2: "Bridgetown",
    parish: "st-michael",
  },
  speightstown: {
    label: "Queen Street, Speightstown, Saint Peter, Barbados",
    lat: "13.2510",
    lon: "-59.6420",
    line1: "Queen Street",
    line2: "Speightstown",
    parish: "st-peter",
  },
  holetown: {
    label: "First Street, Holetown, Saint James, Barbados",
    lat: "13.1870",
    lon: "-59.6370",
    line1: "First Street",
    line2: "Holetown",
    parish: "st-james",
  },
  oistins: {
    label: "Oistins Main Road, Oistins, Christ Church, Barbados",
    lat: "13.0660",
    lon: "-59.5400",
    line1: "Oistins Main Road",
    line2: "Oistins",
    parish: "christ-church",
  },
  "gun hill": {
    label: "Gun Hill Signal Station, Gun Hill, Saint George, Barbados",
    lat: "13.1390",
    lon: "-59.5560",
    line1: "Gun Hill Signal Station",
    line2: "Gun Hill",
    parish: "st-george",
  },
};

/**
 * Answer the address lookup from {@link MOCK_GEOCODE_PLACES} instead of the
 * API's `/geocode` endpoints, which call a metered provider (Google) with a
 * daily cap. The smoke suite must never spend money or fail on someone else's
 * quota (#2679), so every spec with an address-lookup field registers this in
 * a `beforeEach`. Covers every endpoint that reaches Google:
 *
 * - `/geocode?q=` — suggestions. An unknown place gets none, exactly as a real
 *   lookup that finds nothing.
 * - `/geocode/reverse` — the address at a placed pin. Answers with the nearest
 *   mock place's parish (the locked parish must come from the pin) and no
 *   street address, like a pin dropped on open ground.
 * - `/geocode/place/:id` — a picked place's coordinate. The mock suggestions
 *   carry their coordinate, so this is never needed; answer 404 so a stray
 *   call fails visibly rather than reaching Google.
 *
 * `/geocode/polyclinic` is left live: it is our own catchment lookup, not a
 * provider call, and worth exercising.
 */
export async function mockGeocoder(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith("/geocode"),
    (route) => {
      const query = (
        new URL(route.request().url()).searchParams.get("q") ?? ""
      ).toLowerCase();
      const match = Object.entries(MOCK_GEOCODE_PLACES).find(([place]) =>
        query.includes(place),
      );
      return route.fulfill({ json: match ? [match[1]] : [] });
    },
  );
  await page.route(
    (url) => url.pathname.endsWith("/geocode/reverse"),
    (route) => {
      const params = new URL(route.request().url()).searchParams;
      const lat = Number(params.get("lat"));
      const lon = Number(params.get("lon"));
      const nearest = Object.values(MOCK_GEOCODE_PLACES).reduce((a, b) =>
        (Number(a.lat) - lat) ** 2 + (Number(a.lon) - lon) ** 2 <=
        (Number(b.lat) - lat) ** 2 + (Number(b.lon) - lon) ** 2
          ? a
          : b,
      );
      return route.fulfill({
        json: {
          label: "",
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          line1: "",
          line2: "",
          parish: nearest.parish,
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname.includes("/geocode/place/"),
    (route) => route.fulfill({ status: 404, json: {} }),
  );
}

/**
 * Fill an address-lookup (geocoder) field: type the query, wait for the
 * suggestion list, pick the first match, then assert the hidden coordinates
 * field filled — that value is what the catchment router resolves the serving
 * polyclinic from, so an empty one is a real failure, not a soft skip.
 *
 * Fields are addressed by id rather than accessible name because an
 * address-lookup's label is the generic "Address line 1", which a second,
 * plain address elsewhere on the same step usually shares.
 *
 * `pressSequentially` (not `fill`) so the debounced autocomplete actually
 * fires — a single `fill` sets the value without the keystrokes the lookup
 * listens for.
 *
 * Returns the resolved "lat,lng" string. Two of the smoke specs that predate
 * this helper (hairdresser, hair & beauty) each carry their own copy; they are
 * left alone deliberately — this is for new specs. The swimming pool (#2507)
 * and hotel (#2915) specs were rewritten against their recipes and use this one.
 */
export async function fillGeocodedAddress(
  page: Page,
  stepId: string,
  fields: { lineFieldId: string; coordinatesFieldId: string },
  query: string,
): Promise<string> {
  const combo = page.locator(`input[id="${stepId}_${fields.lineFieldId}"]`);
  await combo.click();
  await combo.pressSequentially(query, { delay: 20 });

  const firstSuggestion = page.getByRole("option").first();
  await expect(
    firstSuggestion,
    `geocoder returned no suggestion for "${query}"`,
  ).toBeVisible({ timeout: STEP_TIMEOUT });
  await firstSuggestion.click();

  const coordinates = page.locator(
    `input[id="${stepId}_${fields.coordinatesFieldId}"]`,
  );
  await expect(
    coordinates,
    `geocoder did not populate ${fields.coordinatesFieldId}`,
  ).toHaveValue(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, { timeout: STEP_TIMEOUT });
  return (await coordinates.inputValue()).trim();
}

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

/**
 * The upload's three requests, in the order the widget makes them
 * (apps/forms/src/lib/api/files.ts `sendFile`, then `checkFile`): presign, the
 * PUT of the file to storage (S3, at a presigned URL), then confirm. Confirm
 * may repeat while the malware scan is pending; the first one is watched. `label` names each one in
 * a failure message; the storage request is never named by its URL, which
 * carries the presigned signature.
 */
const UPLOAD_STAGES = [
  {
    label: "POST /files/presign-upload",
    matches: (req: Request) =>
      req.method() === "POST" && req.url().includes("/files/presign-upload"),
    showBody: true,
    hintIfMissing:
      " — the upload never started (was the file rejected before upload?)",
  },
  {
    label: "Upload to file storage",
    // The only PUT the upload widget makes is the file itself.
    matches: (req: Request) => req.method() === "PUT",
    // S3 error bodies can echo signing details; the status is enough.
    showBody: false,
    hintIfMissing: "",
  },
  {
    label: "POST /files/confirm-upload",
    matches: (req: Request) =>
      req.method() === "POST" && req.url().includes("/files/confirm-upload"),
    showBody: true,
    hintIfMissing: "",
  },
] as const;

type UploadStage = (typeof UPLOAD_STAGES)[number];

/**
 * Settles with the stage's response, or its network failure (connection
 * refused, reset, …), whichever happens first. Rejects on timeout or if the
 * page goes away.
 */
function watchStage(
  page: Page,
  stage: UploadStage,
): Promise<{ response: Response } | { failure: string }> {
  const response = page
    .waitForResponse((res) => stage.matches(res.request()), {
      timeout: UPLOAD_TIMEOUT,
    })
    .then((res) => ({ response: res }));
  const failure = page
    .waitForEvent("requestfailed", {
      predicate: (req) => stage.matches(req),
      timeout: UPLOAD_TIMEOUT,
    })
    .then((req) => ({ failure: req.failure()?.errorText ?? "request failed" }));
  // The loser of the race (and any wait left unawaited when an earlier stage
  // fails) must not surface later as an unhandled rejection.
  response.catch(() => undefined);
  failure.catch(() => undefined);
  const outcome = Promise.race([response, failure]);
  outcome.catch(() => undefined);
  return outcome;
}

/**
 * The stage's response, or throw a message naming the stage, the file and
 * what went wrong.
 */
async function expectStageOk(
  pending: Promise<{ response: Response } | { failure: string }>,
  stage: UploadStage,
  fileName: string,
): Promise<Response> {
  let outcome: { response: Response } | { failure: string };
  try {
    outcome = await pending;
  } catch (err) {
    if (err instanceof errors.TimeoutError) {
      throw new Error(
        // Every stage's clock starts when the file is selected.
        `No ${stage.label} within ${UPLOAD_TIMEOUT / 1000}s of selecting ${fileName}${stage.hintIfMissing}`,
      );
    }
    throw new Error(
      `${stage.label} did not complete while uploading ${fileName}`,
      {
        cause: err,
      },
    );
  }
  if ("failure" in outcome) {
    throw new Error(
      `${stage.label} failed: ${outcome.failure} while uploading ${fileName}`,
    );
  }
  const { response } = outcome;
  if (response.ok()) return response;
  const body = stage.showBody
    ? (await response.text().catch(() => "")).slice(0, 300)
    : "";
  throw new Error(
    `${stage.label} failed with ${response.status()} while uploading ${fileName}` +
      (body ? `: ${body}` : ""),
  );
}

/**
 * Throw if confirm-upload says the malware scan refused the file (#2940), so
 * the failure names the verdict rather than timing out on a missing row.
 * `pending` is fine here: the widget asks again until the scan finishes.
 */
async function expectNotRefused(confirm: Response, fileName: string) {
  const body = (await confirm.json().catch(() => ({}))) as {
    data?: { scanStatus?: string };
  };
  const verdict = body.data?.scanStatus;
  if (verdict === "infected" || verdict === "unscannable") {
    throw new Error(
      `POST /files/confirm-upload says ${fileName} is ${verdict} (scanStatus); the widget will not add it`,
    );
  }
}

/**
 * Set one file on an upload input and wait until it is CONFIRMED (#2423).
 * Each of the upload's requests is watched before the file is set, so a
 * throttled, rejected or dropped request fails at once naming the request and
 * its status or network error (a 429 on confirm-upload, a 5xx on presign, a
 * 403 from storage, a refused connection) instead of timing out on a
 * "Remove {name}" button that never appears. That button, in an added row, is
 * still the final check: it only renders there once the value has committed
 * (see uploadOne). A refused file's row has a Remove button too, so the
 * locator skips the in-progress/refused rows (`--pending`).
 */
async function uploadAndConfirm(
  page: Page,
  input: Locator,
  file: UploadFile,
): Promise<void> {
  const watches = UPLOAD_STAGES.map((stage) => watchStage(page, stage));
  await input.setInputFiles(file);
  let confirm: Response | undefined;
  for (const [i, stage] of UPLOAD_STAGES.entries()) {
    confirm = await expectStageOk(watches[i], stage, file.name);
  }
  if (confirm) await expectNotRefused(confirm, file.name);
  await expect(
    page
      .locator(
        ".govbb-file-upload__item:not(.govbb-file-upload__item--pending)",
      )
      .getByRole("button", { name: `Remove ${file.name}` }),
  ).toBeVisible({ timeout: UPLOAD_TIMEOUT });
}

/**
 * Upload one file to a single-file upload field and wait until the upload is
 * CONFIRMED, not merely pending. The component renders a file's name for both
 * the "Uploading…" pending row and the confirmed row, so waiting on the name
 * alone can resolve before `confirm-upload` commits the value (and advancing
 * then trips minItems validation). The "Remove {name}" button in an added
 * (non-pending) row only renders for a confirmed, clean file, so wait on that.
 */
export async function uploadOne(
  page: Page,
  stepId: string,
  suffix: string,
  file: UploadFile,
): Promise<void> {
  await uploadAndConfirm(
    page,
    page.locator(`input[type=file][id="${stepId}_${suffix}"]`),
    file,
  );
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
  files: UploadFile[],
): Promise<void> {
  const input = page.locator(`input[type=file][id="${stepId}_${suffix}"]`);
  for (const file of files) {
    await uploadAndConfirm(page, input, file);
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
