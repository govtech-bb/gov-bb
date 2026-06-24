/**
 * Canonical valid test data for the master service contract.
 *
 * Every value here satisfies the validation rules defined in
 * apps/forms/contracts/master-contract.json.  Import and override
 * only the fields you want to vary in a specific test.
 */

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
