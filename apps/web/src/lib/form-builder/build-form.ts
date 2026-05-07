// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import {
  ClientServiceContract,
  FormMeta,
  RepeatableStepSettings,
  FormValidation,
  ClientFormStep,
} from "@web/types";
import { buildValidation } from "./validation-builder";
import { getStepConditonalTargets, setupRepeatSteps } from "@web/lib";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Build the Validation Schema
  const { schema, defaults, properties }: FormValidation =
    buildValidation(contract);

  // Get fields with conditional on values to watch for changes.
  const stepConditionalTargets = getStepConditonalTargets(contract.steps);

  // Configure repeatable steps with their minimum and config state
  const repeatSettings: RepeatableStepSettings = {};

  const steps = setupRepeatSteps(contract.steps, repeatSettings);

  // Configure check-your-answer step
  const checkAnswers: ClientFormStep = {
    stepId: "check-your-answers",
    fields: [],
    title: "Check your answers",
    description:
      "Review all the information you have provided before submitting your application.",
  };

  steps.splice(-1, 0, checkAnswers);

  // Return FormMeta object with everything configured.
  return {
    formId: contract.formId,
    version: contract.version,
    formTitle: contract.title,
    formDescription: contract.description,
    schema,
    steps,
    defaultValues: defaults,
    validationProperties: properties,
    stepConditionalTargets,
    repeatSettings,
  };
};
