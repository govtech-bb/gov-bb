import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Escape a field ID for use in a CSS attribute selector string value.
 * Using [id="..."] attribute selectors avoids the need for CSS identifier
 * escaping (e.g. the `~` in repeatable step IDs like
 * `step-5-financial-information~1_bank-name` would break `#id` selectors).
 */
function escId(id: string): string {
  // For [id="..."] selectors, escape backslashes first, then double-quotes.
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Playwright FilePayload accepted by setInputFiles */
export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Page Object Model for the master service contract form at /forms/master.
 *
 * Field IDs in the DOM follow the pattern `${stepId}_${fieldId}` (the
 * underscore separator comes from `stepFieldIdConcactenator = "_"`).
 *
 * All helper methods are designed to be self-contained so individual spec
 * files can compose them freely without caring about implementation details.
 */
export class FormPage {
  readonly page: Page;
  readonly continueBtn: Locator;
  readonly previousBtn: Locator;
  readonly errorSummary: Locator;

  constructor(page: Page) {
    this.page = page;
    this.continueBtn = page
      .getByRole("main")
      .getByRole("button", { name: /^(Continue|Submit)$/ });
    this.previousBtn = page.getByRole("button", {
      name: "Previous",
      exact: true,
    });
    this.errorSummary = page.locator(".govbb-error-summary");
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  /** Navigate to the master form.  The step guard redirects to step 1. */
  async goto(): Promise<void> {
    await this.page.goto("/forms/master");
    await this.page.waitForURL(/step=/);
  }

  /** Navigate directly to a step by ID (bypasses step guard — use only when
   *  you've pre-seeded sessionStorage for all preceding steps). */
  async gotoStep(stepId: string): Promise<void> {
    await this.page.goto(`/forms/master?step=${stepId}`);
  }

  async clickContinue(): Promise<void> {
    await this.continueBtn.click();
  }

  async clickPrevious(): Promise<void> {
    await this.previousBtn.click();
  }

  async clickSubmit(): Promise<void> {
    await this.continueBtn.click(); // Submit button is the same primary button
  }

  /** Wait until the URL contains the given step ID.
   *
   * Uses a URL-predicate rather than a glob so that URL-encoded characters
   * (e.g. `~` → `%7E` in repeat step IDs like `step-5-financial-information~1`)
   * are compared correctly via the parsed `step` search parameter.
   */
  async waitForStep(stepId: string): Promise<void> {
    await this.page.waitForURL(
      (url) => url.searchParams.get("step") === stepId,
      { timeout: 10_000 },
    );
  }

  /** Returns the current step ID extracted from the URL ?step= param. */
  currentStepId(): string {
    const url = new URL(this.page.url());
    return url.searchParams.get("step") ?? "";
  }

  // ─── Field getters ─────────────────────────────────────────────────────────

  /** Build the full field ID: `${stepId}_${fieldId}` */
  fid(stepId: string, fieldId: string): string {
    return `${stepId}_${fieldId}`;
  }

  // ─── Field interactions ────────────────────────────────────────────────────

  async fillText(fieldFullId: string, value: string): Promise<void> {
    await this.page.locator(`input[id="${escId(fieldFullId)}"]`).fill(value);
  }

  async fillTextarea(fieldFullId: string, value: string): Promise<void> {
    await this.page.locator(`textarea[id="${escId(fieldFullId)}"]`).fill(value);
  }

  async fillNumber(fieldFullId: string, value: string): Promise<void> {
    const loc = this.page.locator(`input[id="${escId(fieldFullId)}"]`);
    await loc.fill(value);
  }

  async selectOption(fieldFullId: string, value: string): Promise<void> {
    await this.page
      .locator(`select[id="${escId(fieldFullId)}"]`)
      .selectOption(value);
  }

  async clickRadio(fieldFullId: string, labelText: string): Promise<void> {
    await this.page
      .locator(`fieldset[id="${escId(fieldFullId)}"]`)
      .getByRole("radio", { name: labelText, exact: true })
      .check();
  }

  /** Toggle either a single-option or multi-option checkbox by its label. */
  async clickCheckbox(fieldFullId: string, labelText: string): Promise<void> {
    await this.page
      .locator(`fieldset[id="${escId(fieldFullId)}"]`)
      .getByRole("checkbox", { name: labelText, exact: true })
      .click();
  }

  async fillDate(
    fieldFullId: string,
    day: number,
    month: number,
    year: number,
  ): Promise<void> {
    await this.fillText(`${fieldFullId}-day`, String(day));
    await this.fillText(`${fieldFullId}-month`, String(month));
    await this.fillText(`${fieldFullId}-year`, String(year));
  }

  /**
   * Upload one or more files to a file-upload field.
   * The underlying `<input type="file">` is visually hidden; Playwright's
   * setInputFiles works on hidden inputs.
   */
  async uploadFiles(
    fieldFullId: string,
    files: FilePayload | FilePayload[],
  ): Promise<void> {
    const input = this.page.locator(
      `input[type=file][id="${escId(fieldFullId)}"]`,
    );
    const payload = Array.isArray(files) ? files : [files];
    const finished = this.page
      .locator(".form-page__file-field")
      .filter({ has: input })
      .getByRole("button", { name: /^(Remove|Dismiss) / });
    const previousCount = await finished.count();
    await input.setInputFiles(payload);
    await expect(finished).toHaveCount(previousCount + payload.length);
  }

  /** Click the "Remove" button next to the nth uploaded file (0-based). */
  async removeUploadedFile(fieldFullId: string, index: number): Promise<void> {
    const fileField = this.page
      .locator(".form-page__file-field")
      .filter({ has: this.page.locator(`input[id="${escId(fieldFullId)}"]`) });
    await fileField
      .getByRole("button", { name: /^Remove / })
      .nth(index)
      .click();
  }

  // ─── Assertions ────────────────────────────────────────────────────────────

  /** Assert that an inline [data-error] with the given message is visible. */
  async expectError(message: string): Promise<void> {
    await expect(
      this.page.locator(
        ".govbb-error-message, .govbb-file-upload__status--error",
        { hasText: message },
      ),
    ).toBeVisible();
  }

  /** Assert that no [data-error] or [data-error-summary] is visible. */
  async expectNoErrors(): Promise<void> {
    await expect(this.errorSummary).not.toBeVisible();
    await expect(
      this.page.locator(".govbb-error-message").first(),
    ).not.toBeVisible();
  }

  /** Assert that the error summary contains a link/text matching the message. */
  async expectErrorSummaryContains(message: string): Promise<void> {
    await expect(this.errorSummary).toBeVisible();
    await expect(this.errorSummary.getByText(message)).toBeVisible();
  }

  /** Assert that a field (identified by its full ID) is present in the DOM. */
  async expectFieldVisible(fieldFullId: string): Promise<void> {
    await expect(
      this.page.locator(`[id="${fieldFullId}"]`).first(),
    ).toBeVisible();
  }

  /** Assert that a field is NOT present / hidden. */
  async expectFieldHidden(fieldFullId: string): Promise<void> {
    await expect(
      this.page.locator(`[id="${fieldFullId}"]`).first(),
    ).not.toBeVisible();
  }

  /** Assert that a step heading is visible (checks the <h1> text). */
  async expectStepHeading(text: string): Promise<void> {
    await expect(this.page.locator("h1", { hasText: text })).toBeVisible();
  }

  // ─── Composite step-fillers ────────────────────────────────────────────────
  // These methods fill an entire step with the provided (or default) values
  // so that multi-step happy-path tests stay concise.

  /** Fill Step 1 — Personal Details. */
  async fillStep1(opts?: {
    titleLabel?: string;
    firstName?: string;
    lastName?: string;
    dobDay?: number;
    dobMonth?: number;
    dobYear?: number;
    sexLabel?: string;
    nationalityValue?: string;
  }): Promise<void> {
    const s = "step-1-personal-details";
    const o = opts ?? {};

    await this.selectOption(this.fid(s, "title"), "mr");
    await this.fillText(this.fid(s, "first-name"), o.firstName ?? "John");
    await this.fillText(this.fid(s, "last-name"), o.lastName ?? "Smith");
    await this.fillDate(
      this.fid(s, "date-of-birth"),
      o.dobDay ?? 15,
      o.dobMonth ?? 6,
      o.dobYear ?? 1990,
    );
    await this.clickRadio(this.fid(s, "sex"), o.sexLabel ?? "Male");
    await this.selectOption(
      this.fid(s, "nationality"),
      o.nationalityValue ?? "uk",
    );
  }

  /** Fill Step 2 — Contact Information. */
  async fillStep2(opts?: {
    email?: string;
    telephone?: string;
    mobile?: string;
    preferredContactValue?: string;
    contactTimingLabels?: string[];
  }): Promise<void> {
    const s = "step-2-contact-information";
    const o = opts ?? {};

    const email = o.email ?? "john.smith@example.com";
    await this.fillText(this.fid(s, "email"), email);
    await this.fillText(this.fid(s, "confirm-email"), email);
    await this.fillText(this.fid(s, "telephone"), o.telephone ?? "07712345678");
    await this.fillText(this.fid(s, "mobile"), o.mobile ?? "07712345679");
    await this.selectOption(
      this.fid(s, "preferred-contact"),
      o.preferredContactValue ?? "email",
    );

    // can-contact-evening: default is ["afternoon"] (1 item), minSelection=2.
    // Click "Morning" in addition to the pre-selected "Afternoon" to meet the minimum.
    // Callers can pass specific labels to click; we never re-click "Afternoon" to
    // avoid accidentally unchecking it.
    const timings = o.contactTimingLabels ?? ["Morning"];
    for (const label of timings) {
      if (label === "Afternoon") continue; // already selected by default
      await this.clickCheckbox(this.fid(s, "can-contact-evening"), label);
    }

    // single-lonely-textbox — required single checkbox
    await this.clickCheckbox(this.fid(s, "single-lonely-textbox"), "yes");
  }

  /** Fill the random-step (has a single optional text field). */
  async fillRandomStep(): Promise<void> {
    // The step has one empty/optional text field — no action needed.
  }

  /** Fill Step 3 — Address & Employment. */
  async fillStep3(opts?: {
    currentAddress?: string;
    town?: string;
    postcode?: string;
    employmentStatusValue?: string;
    employerName?: string;
    jobTitle?: string;
    annualIncome?: string;
  }): Promise<void> {
    const s = "step-3-address-employment";
    const o = opts ?? {};

    await this.fillText(
      this.fid(s, "current-address"),
      o.currentAddress ?? "123 Test Street, Bridgetown",
    );
    await this.fillText(this.fid(s, "town"), o.town ?? "Bridgetown");
    await this.fillText(this.fid(s, "postcode"), o.postcode ?? "BB12345");
    // country has default "uk" — no need to change it
    await this.selectOption(
      this.fid(s, "employment-status"),
      o.employmentStatusValue ?? "employed",
    );
    // Conditional fields visible when employed / self-employed:
    const status = o.employmentStatusValue ?? "employed";
    if (status === "employed" || status === "self-employed") {
      await this.fillText(
        this.fid(s, "employer-name"),
        o.employerName ?? "Acme Corp Ltd",
      );
      await this.fillText(
        this.fid(s, "job-title"),
        o.jobTitle ?? "Software Developer",
      );
      await this.fillNumber(
        this.fid(s, "annual-income"),
        o.annualIncome ?? "50000",
      );
    }
  }

  /**
   * Fill Step 4 — Documents & Uploads.
   * Uploads one PNG as the identity document and two PNGs as proof-of-address.
   */
  async fillStep4(
    identityFile: FilePayload,
    addressFiles: [FilePayload, FilePayload],
  ): Promise<void> {
    const s = "step-4-documents-uploads";
    await this.uploadFiles(this.fid(s, "upload-document"), identityFile);
    // proof-of-address requires minItems=2
    for (const f of addressFiles) {
      await this.uploadFiles(this.fid(s, "proof-of-address"), f);
    }
  }

  /** The source step contains only the shared bank-account question. */
  async fillStep5Source(opts?: { hasBankAccount?: boolean }): Promise<void> {
    await this.page
      .locator('fieldset[id="step-5-financial-information_has-bank-account"]')
      .getByRole("checkbox", { name: "I do", exact: true })
      .setChecked(opts?.hasBankAccount ?? true);
  }

  /**
   * Fill Step 5 repeat instance (stepId = "step-5-financial-information~N").
   * Does NOT contain the shared `has-bank-account` field.
   * The last required repeat has an "Add another?" radio — answer "No".
   */
  async fillStep5Repeat(
    repeatStepId: string,
    opts?: {
      bankName?: string;
      accountNumber?: string;
      swiftCode?: string;
      initialDeposit?: string;
      fundSourceLabel?: string;
      addAnotherAnswer?: "Yes" | "No";
    },
  ): Promise<void> {
    const o = opts ?? {};

    await this.fillText(
      this.fid(repeatStepId, "bank-name"),
      o.bankName ?? "Repeat Bank",
    );
    await this.selectOption(this.fid(repeatStepId, "account-type"), "current");
    await this.fillText(
      this.fid(repeatStepId, "account-number"),
      o.accountNumber ?? "87654321",
    );
    await this.fillText(
      this.fid(repeatStepId, "swift-code"),
      o.swiftCode ?? "654321",
    );
    await this.fillNumber(
      this.fid(repeatStepId, "initial-deposit"),
      o.initialDeposit ?? "500",
    );
    await this.clickRadio(
      this.fid(repeatStepId, "fund-source"),
      o.fundSourceLabel ?? "Employment Income",
    );

    // Answer the "Add another?" radio if present
    const addAnotherFid = this.fid(repeatStepId, "addAnother");
    const addAnotherGroup = this.page.locator(
      `fieldset[id="${escId(addAnotherFid)}"]`,
    );
    if ((await addAnotherGroup.count()) > 0) {
      await this.clickRadio(addAnotherFid, o.addAnotherAnswer ?? "No");
    }
  }
}
