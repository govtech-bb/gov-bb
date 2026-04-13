// Responsible for mapping ServiceContract and ServiceContract.FormStep to localized versions.

import { FormStep, Primitive, ServiceContract } from "@govtech-bb/form-types";
import { ClientServiceContract, ClientFormStep, ClientPrimitive } from "@web/types";

export const mapContractToLocale = (contract: ServiceContract): ClientServiceContract => {
  throw new Error("Not Implemented");
}

export const mapStepToLocale = (step: FormStep): ClientFormStep => {
  throw new Error("Not Implemented");
}

export const mapFieldToLocale = (field: Primitive): ClientPrimitive => {
  throw new Error("Not Implemented");
}
