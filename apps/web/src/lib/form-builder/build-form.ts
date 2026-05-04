// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import {
  ClientServiceContract,
  FormMeta,
  RepeatableStepSettings,
  FormValidation,
} from "@web/types";
import { buildValidation } from "./validation-builder";
import {
  getStepConditonalTargets,
  setupRepeatSteps,
} from "./helpers/behavior-helper";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Build the Validation Schema
  const { schema, defaults, properties }: FormValidation =
    buildValidation(contract);

  // Get fields with conditional on values to watch for changes.
  const stepConditionalTargets = getStepConditonalTargets(contract.steps);

  // Configure repeatable steps with their minimum and config state
  const repeatSettings: RepeatableStepSettings = {};

  contract.steps = setupRepeatSteps(contract.steps, repeatSettings);

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
    repeatSettings,
  };
};
