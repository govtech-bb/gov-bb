import type { StepScopedValues } from "@govtech-bb/form-conditions";
import { stepFieldIdConcactenator } from "../field-mapper";

// Client form state is keyed by the composite `field.id` (`stepId_fieldId`),
// while the shared conditional/validation evaluators key by stepId →
// bare-fieldId. Split a composite id back into its parts using the same
// last-separator convention the rest of the app uses (`getStepIdFromFieldName`,
// `splitCompositeId` in `validation-builder`): the field id never contains the
// separator, the step id may.
export const splitCompositeId = (
  compositeId: string,
): { stepId: string; fieldId: string } => {
  const idx = compositeId.lastIndexOf(stepFieldIdConcactenator);
  if (idx <= 0) return { stepId: "", fieldId: compositeId };
  return {
    stepId: compositeId.slice(0, idx),
    fieldId: compositeId.slice(idx + stepFieldIdConcactenator.length),
  };
};

// Convert the form's full composite-keyed value map into the `StepScopedValues`
// tree (stepId → { fieldId: value }) the shared evaluators consume. Both client
// conditional call sites build this from `formApi.state.values`.
export const buildStepScopedValues = (
  formValues: Record<string, unknown>,
): StepScopedValues => {
  const tree: Record<string, Record<string, unknown>> = {};
  for (const [compositeId, value] of Object.entries(formValues)) {
    const { stepId, fieldId } = splitCompositeId(compositeId);
    (tree[stepId] ??= {})[fieldId] = value;
  }
  return tree as StepScopedValues;
};
