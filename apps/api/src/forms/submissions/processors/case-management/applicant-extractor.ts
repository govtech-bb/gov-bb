import type { SubmissionValues } from "../../submissions.types";

const APPLICANT_STEP = "applicant-details";

// Steps that carry process/audit metadata rather than application content.
const SKIPPED_STEPS = new Set([
  "declaration",
  "submission-confirmation",
  "check-your-answers",
]);

// Field-id variants for the applicant identity fields. Youth-opportunity
// recipes are mostly consistent (`applicant-first-name`, `applicant-phone`),
// but a few diverge (`applicant-firstName`, `phone-number`), so each logical
// field accepts several candidate ids. These are also the fields excluded from
// `form_data`, since they already appear under `applicant`.
const FIRST_NAME_FIELDS = ["applicant-first-name", "applicant-firstName"];
const LAST_NAME_FIELDS = ["applicant-last-name", "applicant-lastName"];
const EMAIL_FIELDS = ["applicant-email"];
const PHONE_FIELDS = ["applicant-phone", "phone-number"];

const APPLICANT_IDENTITY_FIELDS = new Set([
  ...FIRST_NAME_FIELDS,
  ...LAST_NAME_FIELDS,
  ...EMAIL_FIELDS,
  ...PHONE_FIELDS,
]);

export interface ExtractedApplicant {
  name: string;
  email: string | null;
  phone: string | null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function readField(
  step: Record<string, unknown> | undefined,
  candidates: string[],
): string | null {
  if (!step) return null;
  for (const id of candidates) {
    const found = asString(step[id]);
    if (found !== null) return found;
  }
  return null;
}

function applicantStep(
  values: SubmissionValues,
): Record<string, unknown> | undefined {
  const step = values[APPLICANT_STEP];
  // The applicant step is never repeatable, so ignore the array shape.
  return Array.isArray(step) ? undefined : step;
}

/** Pulls applicant name/email/phone from the `applicant-details` step. */
export function extractApplicant(values: SubmissionValues): ExtractedApplicant {
  const step = applicantStep(values);
  const firstName = readField(step, FIRST_NAME_FIELDS) ?? "";
  const lastName = readField(step, LAST_NAME_FIELDS) ?? "";
  return {
    name: `${firstName} ${lastName}`.trim(),
    email: readField(step, EMAIL_FIELDS),
    phone: readField(step, PHONE_FIELDS),
  };
}

/**
 * Flattens the step-scoped submission `values` into the flat `form_data` object
 * the case-management webhook expects, mirroring the frontend's
 * `buildWebhookFormData`:
 *  - content steps are hoisted so their inner fields sit at the top level,
 *  - process steps (declaration, confirmation, review) are dropped,
 *  - applicant identity fields are dropped (already carried in `applicant`),
 *  - repeatable steps (arrays) are passed through under their stepId.
 */
export function buildWebhookFormData(
  values: SubmissionValues,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [stepId, stepValue] of Object.entries(values)) {
    if (SKIPPED_STEPS.has(stepId)) continue;

    if (Array.isArray(stepValue)) {
      result[stepId] = stepValue;
      continue;
    }

    for (const [fieldId, fieldValue] of Object.entries(stepValue)) {
      if (stepId === APPLICANT_STEP && APPLICANT_IDENTITY_FIELDS.has(fieldId)) {
        continue;
      }
      result[fieldId] = fieldValue;
    }
  }

  return result;
}
