// Responsible for mapping ServiceContract and ServiceContract.FormStep to localized versions.

import { FormStep, Primitive, ServiceContract } from "@govtech-bb/form-types";
import {
  ClientServiceContract,
  ClientFormStep,
  ClientPrimitive,
} from "@web/types";

export const mapContractToLocale = (
  contract: ServiceContract,
): ClientServiceContract => {
  return {
    ...contract,
    steps: contract.steps.map((step) => mapStepToLocale(step)),
  };
};

export const mapStepToLocale = (step: FormStep): ClientFormStep => {
  return {
    ...step,
    fields: step.elements.map((el) => mapFieldToLocale(el, step)),
  };
};

export const mapFieldToLocale = (
  field: Primitive,
  step: FormStep,
): ClientPrimitive => {
  // If it is that we want `options` to be referenced, and accessible via some Key Value store.
  // The logic to fetch, should be done in here.

  return {
    ...field,
    id: getFullFieldId(step.stepId, field.fieldId),
    stepId: step.stepId,
    name: field.name ?? toSentenceCase(field.label),
    disabled: field.isDisabled ?? false,
    hidden: field.isHidden ?? false,
    conditionallyHidden: false,
  };
};

const toSentenceCase = (str?: string): string => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const stepFieldIdConcactenator = "_";

export const getFullFieldId = (stepId: string, fieldId: string): string => {
  return `${stepId}${stepFieldIdConcactenator}${fieldId}`;
};
