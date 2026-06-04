import type { ValidationConfig } from "@govtech-bb/form-types";
import type { StepScopedValues } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

// For cross-field rules (config.reference set), pre-resolves the reference using
// stepValues as a fallback for the current step. Patches config so the runner
// treats it as a literal-value rule — no change to RuleRunner's signature needed.
export function runRule(
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
