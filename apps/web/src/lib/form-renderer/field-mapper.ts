// Responsible for mapping ServiceContract and ServiceContract.FormStep to localized versions.

import { FormStep, Primitive, ServiceContract } from "@govtech-bb/form-types";
import { ClientServiceContract, ClientFormStep, ClientPrimitive } from "@web/types";

export const mapContractToLocale = (contract: ServiceContract): ClientServiceContract => {
  return {
    ...contract,
    steps: contract.steps.map(step => mapStepToLocale(step))
  }
}

export const mapStepToLocale = (step: FormStep): ClientFormStep => {
  return {
    ...step,
    fields: step.elements.map(el => mapFieldToLocale(el)),
  }
}

export const mapFieldToLocale = (field: Primitive): ClientPrimitive => {
  return {
    ...field,
    id: field.fieldId,
    name: field.fieldId,
    disabled: field.isDisabled ?? false,
    hidden: field.isHidden ?? false,
  }
}
