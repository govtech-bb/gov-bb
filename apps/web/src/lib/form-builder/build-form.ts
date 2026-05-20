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
import { v4 as uuidv4 } from "uuid";

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

  const declarationIndex = steps.findIndex((s) => s.stepId === "declaration");
  const submissionIndex = steps.findIndex(
    (s) => s.stepId === "submission-confirmation",
  );
  const insertBefore =
    declarationIndex !== -1 ? declarationIndex : submissionIndex;
  steps.splice(insertBefore, 0, checkAnswers);

  // Generate Idempotency Key
  const idempotencyKey = uuidv4();

  // Return FormMeta object with everything configured.
  return {
    formId: contract.formId,
    version: contract.version,
    formTitle: contract.title,
    formDescription: contract.description,
    contactDetails: contract.contactDetails,
    schema,
    steps,
    defaultValues: defaults,
    validationProperties: properties,
    stepConditionalTargets,
    repeatSettings,
    idempotencyKey,
  };
};
