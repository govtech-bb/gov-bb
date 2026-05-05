import type {
  Primitive,
  ValidationType,
  ValidationConfig,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./types";
import { RULE_REGISTRY } from "./rules";
import { resolveReference, MISSING } from "./rules/resolve-reference";

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

// For cross-field rules (config.reference set), pre-resolves the reference using
// stepValues as a fallback for the current step. Patches config so the runner
// treats it as a literal-value rule — no change to RuleRunner's signature needed.
function runRule(
  runner: (
    v: unknown,
    c: ValidationConfig,
    a: StepScopedValues,
  ) => string | null,
  value: unknown,
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown>,
): string | null {
  if (config.referenceFieldId === undefined) {
    return runner(value, config, allValues);
  }

  const resolved = resolveReference(config, allValues, stepValues);

  // Reference not found anywhere (field hidden or not submitted) — skip rule
  if (resolved === MISSING) return null;

  // Patch: replace reference lookup with resolved literal so runner uses the right value
  const patched: ValidationConfig = {
    ...config,
    value: resolved,
    referenceFieldId: undefined,
    referenceStepId: undefined,
    targetStepId: undefined,
  };
  return runner(value, patched, allValues);
}

export function validateField(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): string[] {
  const { validations, htmlType } = field;
  if (!validations) return [];

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
