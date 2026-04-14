// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import { ClientServiceContract, FormMeta } from "@web/types";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Obtains the Validation Rules
  // Adds the onChange and onBlur methods to each field based on validation rules.
  // Setup Default values
  // Setup isStepVisible and getVisibleSteps methods based on behaviours.
  // Return FormMeta object with everything configured.
  throw new Error("Not Implemented");
};
