/**
 * Canonical valid test data for the master service contract.
 *
 * Every value here satisfies the validation rules defined in
 * apps/forms/contracts/master-contract.json.  Import and override
 * only the fields you want to vary in a specific test.
 */

// ─── Step 1 — Personal Details ────────────────────────────────────────────────

export const STEP1 = {
  /** Select option label shown in the UI */
  titleLabel: "Mr",
  firstName: "John",
  lastName: "Smith",
  /** Date of birth — must be in the past, year 1900–2008 */
  dobDay: 15,
  dobMonth: 6,
  dobYear: 1990,
  /** Radio option label */
  sexLabel: "Male",
  /** Select option value */
  nationalityValue: "uk",
  /** NINO — only validated by pattern when provided */
  nino: "AB123456C",
} as const;

// ─── Step 2 — Contact Information ─────────────────────────────────────────────

export const STEP2 = {
  email: "john.smith@example.com",
  telephone: "07712345678", // 10 digits — matches ^[0-9]{10,15}$
  mobile: "07712345679",
  /** Select option value */
  preferredContactValue: "email",
  /**
   * Checkbox labels to tick.  min=2, max=3 required.
   * Default is ["afternoon"] so we add one more.
   */
  contactTimingLabels: ["Morning", "Afternoon"],
  /** Single-option checkbox label */
  singleCheckboxLabel: "yes",
} as const;

// ─── Step 3 — Address & Employment ────────────────────────────────────────────

export const STEP3 = {
  currentAddress: "123 Test Street, Bridgetown", // minLength=5
  town: "Bridgetown",
  /** BB postcode pattern: ^BB[0-9]{5}$ */
  postcode: "BB12345",
  /** Select option value */
  countryValue: "uk",
  /** Select option value — "employed" triggers employer/job/income fields */
  employmentStatusValue: "employed",
  employerName: "Acme Corp Ltd",
  jobTitle: "Software Developer",
  annualIncome: "50000",
} as const;

// ─── Step 4 — Document Uploads ────────────────────────────────────────────────

export const STEP4 = {
  /** Select option values for document-types multi-select */
  documentTypeValues: ["bank-statement"],
} as const;

// ─── Step 5 — Financial Information (repeatable step) ─────────────────────────

export const STEP5 = {
  bankName: "National Bank",
  /** Select option value */
  accountTypeValue: "current",
  /** 4–20 digits */
  accountNumber: "12345678",
  /** Pattern: ^[0-9]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{2}$ */
  swiftCode: "123456",
  /** min=100, max=100_000 */
  initialDeposit: "1000",
  /** Radio option label — does NOT trigger the "other" conditional */
  fundSourceLabel: "Employment Income",
} as const;

// ─── In-memory test files ──────────────────────────────────────────────────────

/**
 * Minimal 1×1 white PNG (37 bytes).  Satisfies image/png MIME checks and is
 * well under any size limit used in the master contract.
 */
export const MINIMAL_PNG_BUFFER = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR length + type
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01, // width=1, height=1
  0x08,
  0x02,
  0x00,
  0x00,
  0x00,
  0x90,
  0x77,
  0x53, // bit depth=8, RGB
  0xde,
  0x00,
  0x00,
  0x00,
  0x0c,
  0x49,
  0x44,
  0x41, // IDAT chunk
  0x54,
  0x08,
  0xd7,
  0x63,
  0xf8,
  0xcf,
  0xc0,
  0x00,
  0x00,
  0x00,
  0x02,
  0x00,
  0x01,
  0xe2,
  0x21,
  0xbc,
  0x33,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e, // IEND
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]);

export const TEST_PNG = {
  name: "test-document.png",
  mimeType: "image/png",
  buffer: MINIMAL_PNG_BUFFER,
} as const;

export const TEST_PNG_2 = {
  name: "test-document-2.png",
  mimeType: "image/png",
  buffer: MINIMAL_PNG_BUFFER,
} as const;

export const TEST_PNG_3 = {
  name: "test-document-3.png",
  mimeType: "image/png",
  buffer: MINIMAL_PNG_BUFFER,
} as const;

/** Exceeds the 5 MB per-item limit on upload-document */
export const OVERSIZED_PNG = {
  name: "oversized.png",
  mimeType: "image/png",
  buffer: Buffer.alloc(6 * 1024 * 1024, 0x00),
} as const;

/** Not in the accepted list [application/pdf, image/jpeg, image/png] */
export const INVALID_TYPE_FILE = {
  name: "document.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Hello world"),
} as const;
