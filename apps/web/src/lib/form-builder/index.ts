// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import { ClientServiceContract, FormMeta, FormValidation } from "@web/types";
import { buildValidation } from "./validation-builder";
import { getStepConditonalTargets } from "./behavior-helper";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Build the Validation Schema
  const { schema, defaults, properties }: FormValidation =
    buildValidation(contract);

  const stepConditionalTargets = getStepConditonalTargets(contract.steps);

  // Return FormMeta object with everything configured.
  return {
    formId: contract.formId,
    formTitle: contract.title,
    formDescription: contract.description,
    schema,
    steps: contract.steps,
    defaultValues: defaults,
    validationProperties: properties,
    stepConditionalTargets,
  };
};

// Other Exports

export { checkConditionalOn, getVisibleSteps } from "./behavior-helper";
export type { RequiredState } from "./validation-methods";
export { fetchContract, FormFetchError } from "./form-fetcher";
