import {
  ClientFormStep,
  ClientPrimitive,
  RepeatableStepSettings,
  RepeatableConfig,
} from "@web/types";
import { getFullFieldId } from "@web/lib";
import {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";

export const setupRepeatSteps = (
  formSteps: ClientFormStep[],
  repeatSettings: RepeatableStepSettings,
): ClientFormStep[] => {
  const updatedSteps = [...formSteps];
  for (let i = 0; i < updatedSteps.length; i++) {
    const step = updatedSteps[i];
    if (!step.behaviours || step.behaviours.length === 0) continue;
    const repeatBehaviour: RepeatableBehaviour = step.behaviours.filter(
      (b) => b.type === "repeatable",
    )[0];
    if (!repeatBehaviour) continue;
    const sharedBehaviour: SharedFieldsBehaviour = step.behaviours.filter(
      (b) => b.type === "sharedFields",
    )[0];

    // Need to see if this is the original step

    const idParts = step.stepId.split("--");
    // If not the original, just skip
    if (idParts.length > 1) continue;

    // We can setup the config first.
    const repeatConfig: RepeatableConfig = {
      minRepeats: repeatBehaviour.min,
      maxRepeats: repeatBehaviour.max,
      orderedStepIds: [step.stepId],
      stepData: {},
      sharedData: {},
    };

    if (repeatBehaviour.min) {
      // Start at 1 to account for source step
      for (let j = 1; j <= repeatBehaviour.min; j++) {
        const repeatStepCount = j;
        const nextStepId = `${step.stepId}--${repeatStepCount}`;

        let nextStepFields = generateRepeatStepFields(
          step.fields,
          nextStepId,
          undefined,
          sharedBehaviour,
        );

        if (j == repeatBehaviour.min) {
          const addAnother = generateRepeatableAddAnotherField(nextStepId);
          nextStepFields.push(addAnother);
        }

        const nextStep: ClientFormStep = {
          ...step,
          fields: nextStepFields,
          stepId: nextStepId,
        };
        updatedSteps.splice(i + repeatStepCount, 0, nextStep);
        repeatConfig.orderedStepIds.push(nextStepId);
      }
    }
    repeatSettings[step.stepId] = repeatConfig;
  }
  return updatedSteps;
};

const generateRepeatStepFields = (
  currentFields: ClientPrimitive[],
  nextStepId: string,
  addAnotherStepId?: string,
  sharedFieldBehaviour?: SharedFieldsBehaviour,
): ClientPrimitive[] => {
  let nextStepFields = currentFields
    .filter((f) => f.id !== addAnotherStepId)
    .map((field) => {
      field.id = getFullFieldId(nextStepId, field.fieldId);
      return field;
    });

  if (sharedFieldBehaviour) {
    nextStepFields = nextStepFields.filter(
      (field) => !sharedFieldBehaviour.fieldIds.includes(field.fieldId),
    );
  }

  return nextStepFields;
};

export const generateRepeatableAddAnotherField = (
  stepId: string,
): ClientPrimitive => {
  const addAnotherField: ClientPrimitive = {
    id: getFullFieldId(stepId, "addAnother"),
    fieldId: "addAnother",
    stepId: stepId,
    name: "Add Another",
    label: "Add another?",
    htmlType: "radio",
    disabled: false,
    hidden: false,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ],
    validations: {
      required: {
        value: true,
        error: "Add another is required.",
      },
    },
  };
  return addAnotherField;
};
