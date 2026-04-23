// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import {
  ClientFormStep,
  ClientServiceContract,
  FormMeta,
  FormValidation,
  FormValues,
} from "@web/types";
import { buildValidation } from "./validation-builder";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Build the Validation Schema
  const { schema, defaults, properties }: FormValidation =
    buildValidation(contract);

  // Get method to calculate visible steps

  const isStepVisible = buildIsStepVisible(contract);

  // Return FormMeta object with everything configured.
  return {
    formId: contract.formId,
    formTitle: contract.title,
    formDescription: contract.description,
    schema,
    steps: contract.steps,
    defaultValues: defaults,
    validationProperties: properties,
    getVisibleSteps,
    isStepVisible,
  };
};

type IsStepVisible = (f: ClientFormStep, v: FormValues) => boolean;

const buildIsStepVisible = (contract: ClientServiceContract): IsStepVisible => {
  return (formStep: ClientFormStep, formValues: FormValues): boolean => {
    throw new Error("Not Implemented");
  };
};

const getVisibleSteps = (
  formSteps: ClientFormStep[],
  formValues: FormValues,
): ClientFormStep[] => {
  throw new Error("Not Implemented");
};

// Other Exports

export { fetchContract } from "./form-fetcher";
