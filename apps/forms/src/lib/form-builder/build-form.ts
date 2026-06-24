// Responsible for turning a ClientServiceContract into a FormMeta for consumption.

import {
  ClientServiceContract,
  FormMeta,
  RepeatableStepSettings,
  FormValidation,
  ClientFormStep,
} from "@forms/types";
import { buildValidation } from "./validation-builder";
import { getStepConditonalTargets } from "./helpers/behavior-helper";
import { setupRepeatSteps } from "./helpers/repeatable-helper";
import { v4 as uuidv4 } from "uuid";

export const buildForm = (contract: ClientServiceContract): FormMeta => {
  // Build the per-field validation handlers and defaults.
  const { defaults, properties }: FormValidation = buildValidation(contract);

  // Get fields with conditional on values to watch for changes.
  const stepConditionalTargets = getStepConditonalTargets(contract.steps);

  // Configure repeatable steps with their minimum and config state
  const repeatSettings: RepeatableStepSettings = {};

  const steps = setupRepeatSteps(contract.steps, repeatSettings);

  // Inject the check-your-answers review step, unless the contract already
  // carries one. The form builder now authors check-your-answers as a
  // first-class required step, so newer recipes ship it already positioned
  // before declaration; legacy recipes (saved before that change) don't, and
  // still need it spliced in here. Guarding on its presence keeps the step
  // single — never duplicated — across both eras of recipe.
  const alreadyHasCheckAnswers = steps.some(
    (s) => s.stepId === "check-your-answers",
  );
  if (!alreadyHasCheckAnswers) {
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
  }

  // Generate Idempotency Key
  const idempotencyKey = uuidv4();

  // Return FormMeta object with everything configured.
  return {
    formId: contract.formId,
    formTitle: contract.title,
    formDescription: contract.description,
    contactDetails: contract.contactDetails,
    steps,
    defaultValues: defaults,
    validationProperties: properties,
    stepConditionalTargets,
    repeatSettings,
    idempotencyKey,
  };
};
