import type { Primitive, ValidationType } from "@govtech-bb/form-types";
import type { StepScopedValues } from "./types";
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

export function validateField(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): string[] {
  const { validations, htmlType } = field;
  if (!validations) return [];

  // Date fields follow the GOV.UK date input error guidance: a single
  // highest-priority message (missing/incomplete > impossible > other rules).
  if (htmlType === "date") {
    const dateError = validateDateField(field, value, allValues, stepValues);
    return dateError ? [dateError.message] : [];
  }

  const errors: string[] = [];
  const requiredConfig = validations["required"];
  const isRequired =
    requiredConfig !== undefined &&
    (requiredConfig.value === undefined || requiredConfig.value !== false);

  if (isRequired) {
    const runner = RULE_REGISTRY["required"]!;
    const msg = runner(value, requiredConfig!, allValues);
    if (msg !== null) {
      errors.push(msg);
      return errors;
    }
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
    if (msg !== null) errors.push(msg);
  }

  return errors;
}
