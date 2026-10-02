import type { ServiceContract, SubmissionValues } from "@govtech-bb/form-types";

/**
 * The set of option values that belong to a `higherRisk` category in any
 * `checkbox-accordion` field on the contract, keyed by "stepId.fieldId".
 * Returns an empty map when the form has no such field.
 */
function higherRiskValuesByField(
  contract: ServiceContract,
): Map<string, Set<string>> {
  const byField = new Map<string, Set<string>>();
  for (const step of contract.steps) {
    for (const field of step.elements) {
      if (field.htmlType !== "checkbox-accordion" || !field.groups) continue;
      const values = new Set<string>();
      for (const group of field.groups) {
        if (!group.higherRisk) continue;
        for (const option of group.options) values.add(option.value);
      }
      byField.set(`${step.stepId}.${field.fieldId}`, values);
    }
  }
  return byField;
}

/** Every selected value for a field, across repeatable-step instances too. */
function selectedValues(
  values: SubmissionValues,
  stepId: string,
  fieldId: string,
): string[] {
  const stepValue = values[stepId];
  const instances = Array.isArray(stepValue) ? stepValue : [stepValue ?? {}];
  return instances.flatMap((instance) => {
    const raw = instance?.[fieldId];
    return Array.isArray(raw) ? (raw as string[]) : [];
  });
}

/**
 * Whether the submission selected any item from a higher-risk category of a
 * `checkbox-accordion` field — a derived signal reviewers use to decide how the
 * set-up is inspected (#2065). Returns `null` when the form carries no
 * checkbox-accordion field, so payloads for unrelated forms omit the flag
 * entirely rather than always reporting `false`.
 */
export function deriveHigherRiskSelection(
  contract: ServiceContract,
  values: SubmissionValues,
): boolean | null {
  const byField = higherRiskValuesByField(contract);
  if (byField.size === 0) return null;

  for (const [key, higherRiskValues] of byField) {
    const [stepId, fieldId] = key.split(".");
    const selected = selectedValues(values, stepId, fieldId);
    if (selected.some((v) => higherRiskValues.has(v))) return true;
  }
  return false;
}
