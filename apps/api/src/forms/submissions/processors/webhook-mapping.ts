import type { WebhookMapping } from "@govtech-bb/form-types";
import type { SubmissionValues } from "../submissions.types";

/**
 * Builds the external "case" payload from a submission using the recipe's
 * declarative `mapping` — generic over any form, no hardcoded step/field
 * conventions. Field paths are `"stepId.fieldId"` into the submission values.
 *
 * This replaces the youth-opportunity-specific applicant-extractor: which step
 * holds the name, which field is the email, and which steps are process-only
 * are all declared per form in the recipe, so a new form is onboarded by
 * config alone.
 */

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** Reads a `"stepId.fieldId"` path out of the submission values. */
export function readPath(
  values: SubmissionValues,
  path: string,
): string | null {
  const dot = path.indexOf(".");
  if (dot === -1) return null;
  const stepId = path.slice(0, dot);
  const fieldId = path.slice(dot + 1);
  const step = values[stepId];
  if (!step || Array.isArray(step)) return null;
  return asString(step[fieldId]);
}

/** Joins one or more paths (e.g. first + last name) into a single string. */
function readName(values: SubmissionValues, name: string | string[]): string {
  const paths = Array.isArray(name) ? name : [name];
  return paths
    .map((p) => readPath(values, p))
    .filter((v): v is string => v !== null)
    .join(" ")
    .trim();
}

/**
 * Flattens step-scoped values into a flat `form_data` object:
 *  - steps in `excludeSteps` are dropped (process steps),
 *  - the fields already surfaced under `applicant` are dropped (no duplication),
 *  - repeatable steps (arrays) pass through under their stepId,
 *  - other content fields are hoisted to the top level.
 */
function buildFormData(
  values: SubmissionValues,
  excludeSteps: string[],
  applicantPaths: string[],
): Record<string, unknown> {
  const excluded = new Set(excludeSteps);
  const dropped = new Set(applicantPaths); // "stepId.fieldId"
  const result: Record<string, unknown> = {};

  for (const [stepId, stepValue] of Object.entries(values)) {
    if (excluded.has(stepId)) continue;

    if (Array.isArray(stepValue)) {
      result[stepId] = stepValue;
      continue;
    }

    for (const [fieldId, fieldValue] of Object.entries(stepValue)) {
      if (dropped.has(`${stepId}.${fieldId}`)) continue;
      result[fieldId] = fieldValue;
    }
  }

  return result;
}

export interface MappedCasePayload {
  code: string;
  programme_code: string;
  applicant: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  form_data: Record<string, unknown>;
  submitted_at: string;
}

export function buildMappedCasePayload(args: {
  mapping: WebhookMapping;
  values: SubmissionValues;
  referenceCode: string;
  submittedAt: string;
}): MappedCasePayload {
  const { mapping, values, referenceCode, submittedAt } = args;
  const namePaths = Array.isArray(mapping.applicant.name)
    ? mapping.applicant.name
    : [mapping.applicant.name];

  return {
    code: referenceCode,
    programme_code: mapping.programmeCode,
    applicant: {
      name: readName(values, mapping.applicant.name),
      email: readPath(values, mapping.applicant.email),
      phone: readPath(values, mapping.applicant.phone),
    },
    form_data: buildFormData(values, mapping.excludeSteps ?? [], [
      ...namePaths,
      mapping.applicant.email,
      mapping.applicant.phone,
    ]),
    submitted_at: submittedAt,
  };
}
