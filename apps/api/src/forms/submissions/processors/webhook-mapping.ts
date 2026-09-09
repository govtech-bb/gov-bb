import type {
  Primitive,
  ServiceContract,
  WebhookMapping,
} from "@govtech-bb/form-types";
import type { SubmissionValues } from "../submissions.types";
import { isOptionField, resolveOptionDisplay } from "@/forms/field-display";

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
  // fieldArray answers are string arrays (#2317): join the non-blank entries
  // comma-space separated, the same shape the review screen renders. Returning
  // null here instead would lose the answer entirely — an applicant path is
  // also dropped from `form_data`, so a phone field that allows "add another"
  // would reach the case system nowhere.
  if (Array.isArray(value)) {
    const entries = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    return entries.length > 0 ? entries.join(", ") : null;
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
 * Builds the `form_data` object from step-scoped values:
 *  - steps in `excludeSteps` are dropped (process steps),
 *  - the fields already surfaced under `applicant` are dropped (no duplication),
 *  - repeatable steps (arrays) pass through under their stepId.
 *
 * Non-repeatable content fields are either hoisted to the top level (default)
 * or, when `groupByStep` is set, kept nested under their step id (empty groups
 * omitted).
 *
 * Option fields (radio/select/checkbox/checkbox-accordion) whose definition is
 * in `fieldByPath` have their stored value-slugs resolved to display labels
 * (#842); every other field passes through raw. An empty map ⇒ full passthrough.
 */
function buildFormData(
  values: SubmissionValues,
  excludeSteps: string[],
  applicantPaths: string[],
  groupByStep: boolean,
  fieldByPath: Map<string, Primitive>,
): Record<string, unknown> {
  const excluded = new Set(excludeSteps);
  const dropped = new Set(applicantPaths); // "stepId.fieldId"
  const result: Record<string, unknown> = {};

  const display = (
    stepId: string,
    fieldId: string,
    value: unknown,
  ): unknown => {
    const field = fieldByPath.get(`${stepId}.${fieldId}`);
    return field && isOptionField(field)
      ? resolveOptionDisplay(field, value)
      : value;
  };

  for (const [stepId, stepValue] of Object.entries(values)) {
    if (excluded.has(stepId)) continue;

    if (Array.isArray(stepValue)) {
      // Repeatable step — resolve option labels within each instance's fields.
      result[stepId] = stepValue.map((instance) =>
        instance && typeof instance === "object" && !Array.isArray(instance)
          ? Object.fromEntries(
              Object.entries(instance as Record<string, unknown>).map(
                ([fieldId, v]) => [fieldId, display(stepId, fieldId, v)],
              ),
            )
          : instance,
      );
      continue;
    }

    const group: Record<string, unknown> = {};
    for (const [fieldId, fieldValue] of Object.entries(stepValue)) {
      if (dropped.has(`${stepId}.${fieldId}`)) continue;
      const resolved = display(stepId, fieldId, fieldValue);
      if (groupByStep) {
        group[fieldId] = resolved;
      } else {
        result[fieldId] = resolved;
      }
    }
    if (groupByStep && Object.keys(group).length > 0) {
      result[stepId] = group;
    }
  }

  return result;
}

/** Index a hydrated contract's option fields by `"stepId.fieldId"` so the
 * form_data builder can resolve value-slugs to labels. */
function indexFields(contract?: ServiceContract): Map<string, Primitive> {
  const byPath = new Map<string, Primitive>();
  for (const step of contract?.steps ?? []) {
    for (const element of step.elements) {
      if (element.fieldId)
        byPath.set(`${step.stepId}.${element.fieldId}`, element);
    }
  }
  return byPath;
}

/**
 * The programme code a form's recipe declares on its webhook mapping, or
 * undefined when it declares no mapped webhook. This is the code the CMS
 * expects when nothing narrows it further; catchment routing composes the
 * per-polyclinic code from it (see CatchmentRoutingService).
 */
export function programmeCodeFromProcessors(
  processors: readonly { type: string; config?: unknown }[],
): string | undefined {
  for (const processor of processors) {
    if (processor.type !== "webhook") continue;
    const mapping = (processor.config as { mapping?: unknown } | undefined)
      ?.mapping as { programmeCode?: string } | undefined;
    if (mapping?.programmeCode) return mapping.programmeCode;
  }
  return undefined;
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
  /** Derived reviewer signal (#2065): present only for forms that carry a
   * checkbox-accordion field, so other forms' payloads are unchanged. */
  higher_risk?: boolean;
}

export function buildMappedCasePayload(args: {
  mapping: WebhookMapping;
  values: SubmissionValues;
  referenceCode: string;
  submittedAt: string;
  /** Whether a higher-risk category was selected; `null`/omitted when the form
   * has no checkbox-accordion field, in which case the flag is not emitted. */
  higherRisk?: boolean | null;
  /** When set (coordinate-based catchment routing), overrides the static
   *  `mapping.programmeCode`. */
  programmeCodeOverride?: string;
  /** Hydrated form contract; when present, option field values in `form_data`
   *  are resolved to their display labels (#842). Omitted ⇒ raw passthrough. */
  contract?: ServiceContract;
}): MappedCasePayload {
  const {
    mapping,
    values,
    referenceCode,
    submittedAt,
    higherRisk,
    programmeCodeOverride,
    contract,
  } = args;
  const namePaths = Array.isArray(mapping.applicant.name)
    ? mapping.applicant.name
    : [mapping.applicant.name];

  return {
    code: referenceCode,
    programme_code: programmeCodeOverride ?? mapping.programmeCode,
    applicant: {
      name: readName(values, mapping.applicant.name),
      email: readPath(values, mapping.applicant.email),
      phone: readPath(values, mapping.applicant.phone),
    },
    form_data: buildFormData(
      values,
      mapping.excludeSteps ?? [],
      [...namePaths, mapping.applicant.email, mapping.applicant.phone],
      mapping.groupByStep ?? false,
      indexFields(contract),
    ),
    submitted_at: submittedAt,
    ...(higherRisk !== null &&
      higherRisk !== undefined && { higher_risk: higherRisk }),
  };
}
