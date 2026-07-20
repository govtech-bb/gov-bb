import { v4 as uuid } from "uuid";

// Single source of truth for the submission upload-key layout:
//   uploads/<formId>/<stepId>/<fieldId>/<yyyy>/<mm>/<uuid>-<sanitized-name>
//
// The builder, the strict tuple parser, and the permissive DTO validator all
// compose from the same segment sub-patterns below, so a change to the shape
// can't silently drift between them (#1852). NOTE: the two regexes intentionally
// differ — the DTO pattern is case-sensitive and treats the tuple as optional
// (legacy tuple-less keys still in flight since #1745/#284), while the parser is
// case-insensitive and requires the tuple. That difference is preserved exactly;
// the formId case question is tracked separately (#1853).

const FORM_ID = "[a-z0-9-]+";
const STEP_ID = "[A-Za-z0-9-]+";
// fieldId is embedded in the key path (#284), so it must be path-safe — allows
// the camelCase recipe field ids in use (e.g. "policeCertificate").
const FIELD_ID = "[A-Za-z0-9_-]+";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILENAME = "[a-z0-9._-]+";
const YEAR = "\\d{4}";
const MONTH = "\\d{2}";

export interface SubmissionKeyTuple {
  formId: string;
  stepId: string;
  fieldId: string;
}

/** `uploads/<formId>/` — the per-form prefix used to reject foreign-form keys. */
export function submissionKeyPrefix(formId: string): string {
  return `uploads/${formId}/`;
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Build the S3 key for a submission upload. The (formId, stepId, fieldId) tuple
 * is embedded in the prefix so confirm can verify the upload was presigned under
 * the same field — closing the presign↔confirm binding gap (#284). stepId and
 * fieldId are DTO-validated path-safe slugs, so they can't inject path segments.
 */
export function buildSubmissionKey(
  formId: string,
  stepId: string,
  fieldId: string,
  fileName: string,
): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${formId}/${stepId}/${fieldId}/${yyyy}/${mm}/${uuid()}-${sanitizeFileName(
    fileName,
  )}`;
}

const TUPLE_PATTERN = new RegExp(
  `^uploads/(${FORM_ID})/(${STEP_ID})/(${FIELD_ID})/${YEAR}/${MONTH}/`,
  "i",
);

/**
 * Parse the (formId, stepId, fieldId) tuple embedded by `buildSubmissionKey`.
 * Returns the tuple for a new-format key, or null for a legacy (tuple-less) key
 * still in flight across deploy. Only the exact shape matches — a forged key
 * can't claim a tuple it wasn't presigned with.
 */
export function parseSubmissionKey(key: string): SubmissionKeyTuple | null {
  const m = key.match(TUPLE_PATTERN);
  return m ? { formId: m[1], stepId: m[2], fieldId: m[3] } : null;
}

/**
 * Full-key validation pattern for the confirm DTO. Permissive: the
 * stepId/fieldId segment is optional so keys presigned before the binding
 * change (#284) still validate during rollout.
 */
export const SUBMISSION_KEY_PATTERN = new RegExp(
  `^uploads/${FORM_ID}/(?:${STEP_ID}/${FIELD_ID}/)?${YEAR}/${MONTH}/${UUID}-${FILENAME}$`,
);
