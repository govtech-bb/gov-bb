import {
  evaluateFormConditions,
  type StepScopedValues,
} from "@govtech-bb/form-conditions";
import type { ServiceContract } from "@govtech-bb/form-types";

// Which fields are currently ACTIVE given the answers so far. Conditional fields
// (show-hide / radio reveals via `behaviours`) are inactive until their trigger
// is set, so the chat shouldn't ask them — and a conditionally-required field
// only counts once revealed. Ported from the old app's getActiveFieldIds; uses
// the shared @govtech-bb/form-conditions engine so chat and the forms app agree
// on visibility. Values must be the CANONICAL strings (coerce.ts) the condition
// engine String()-compares against the behaviour values.
function flatToStepScoped(
  contract: ServiceContract,
  flat: Record<string, string>,
): StepScopedValues {
  const out: StepScopedValues = {};
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (Object.prototype.hasOwnProperty.call(flat, el.fieldId)) {
        ((out[step.stepId] ??= {}) as Record<string, unknown>)[el.fieldId] =
          flat[el.fieldId];
      }
    }
  }
  return out;
}

function flatten(map: Map<string, Set<string>>): Set<string> {
  const flat = new Set<string>();
  for (const ids of map.values()) for (const id of ids) flat.add(id);
  return flat;
}

export function activeFieldIds(
  contract: ServiceContract,
  values: Record<string, string>,
): Set<string> {
  const { activeFieldIds: byStep } = evaluateFormConditions(
    contract,
    flatToStepScoped(contract, values),
  );
  return flatten(byStep);
}

// Fields whose `optionalIf` condition currently matches — active/visible but NOT
// required, so a completeness check must not demand them. (Instance-0 projection;
// repeatable steps are out of scope for chat collection.)
export function optionalFieldIds(
  contract: ServiceContract,
  values: Record<string, string>,
): Set<string> {
  const { optionalFieldsByInstance } = evaluateFormConditions(
    contract,
    flatToStepScoped(contract, values),
  );
  const flat = new Set<string>();
  for (const instances of optionalFieldsByInstance.values()) {
    for (const id of instances[0] ?? []) flat.add(id);
  }
  return flat;
}
