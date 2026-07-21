import type { Primitive, ValidationType } from "@govtech-bb/form-types";
import type { FieldErrorEntry, StepScopedValues } from "./types";
import { RULE_REGISTRY } from "./rules";
import { runRule } from "./rules/run-rule";
import { validateDateField } from "./validate-date";

const EMPTY_BY_TYPE: Partial<Record<string, unknown>> = {
  number: undefined,
  checkbox: [],
  select: [],
  file: [],
};

function isEmpty(value: unknown, htmlType: string): boolean {
  const emptyValue = EMPTY_BY_TYPE[htmlType];
  if (emptyValue !== undefined) {
    if (Array.isArray(emptyValue))
      return Array.isArray(value) && value.length === 0;
    return value === emptyValue;
  }
  return value === undefined || value === null || value === "";
}

/**
 * Validate a field, returning each failure as a `{ code, message }` entry. The
 * `code` is the stable rule type that failed (or a synthetic date code); the
 * `message` is the user-facing wording. `validateField` below discards the
 * codes for the string-only display path; analytics uses the codes.
 */
export function validateFieldEntries(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): FieldErrorEntry[] {
  const { validations, htmlType } = field;
  if (!validations) return [];

  // Date fields follow the GOV.UK date input error guidance: a single
  // highest-priority message (missing/incomplete > impossible > other rules).
  if (htmlType === "date") {
    const dateError = validateDateField(field, value, allValues, stepValues);
    if (!dateError) return [];
    return [
      { code: dateError.code ?? "invalid_date", message: dateError.message },
    ];
  }

  const entries: FieldErrorEntry[] = [];
  const requiredConfig = validations["required"];
  const isRequired =
    requiredConfig !== undefined &&
    (requiredConfig.value === undefined || requiredConfig.value !== false);

  if (isRequired) {
    const runner = RULE_REGISTRY["required"]!;
    const msg = runner(value, requiredConfig!, allValues);
    if (msg !== null) return [{ code: "required", message: msg }];
  }

  if (isEmpty(value, htmlType)) return [];

  for (const [type, config] of Object.entries(validations) as [
    ValidationType,
    (typeof validations)[ValidationType],
  ][]) {
    if (type === "required" || type === "conditionalOn") continue;
    const runner = RULE_REGISTRY[type];
    if (!runner || !config) continue;
    const msg = runRule(runner, value, config, allValues, stepValues);
    if (msg !== null) entries.push({ code: type, message: msg });
  }

  return entries;
}

export function validateField(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): string[] {
  return validateFieldEntries(field, value, allValues, stepValues).map(
    (e) => e.message,
  );
}
