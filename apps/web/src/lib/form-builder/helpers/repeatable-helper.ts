import {
  ClientFormStep,
  ClientPrimitive,
  RepeatableStepSettings,
  RepeatableConfig,
  AddRepeatableStepParams,
  RemoveRepeatableStepParams,
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
    const sharedBehaviour: SharedFieldsBehaviour | undefined =
      step.behaviours.filter((b) => b.type === "sharedFields")[0];

    const sharedFields: string[] = sharedBehaviour?.fieldIds ?? [];

    // Need to see if this is the original step

    const repeatStepCount = getRepeatStepCount(step.stepId);
    // If not the original, just skip
    if (repeatStepCount === undefined || repeatStepCount > 0) continue;

    // We can setup the config first.
    const repeatConfig: RepeatableConfig = {
      minRepeats: repeatBehaviour.min,
      maxRepeats: repeatBehaviour.max,
      orderedStepIds: [step.stepId],
      stepData: {},
      sharedData: {},
    };

    // Update fields for source step based on sharedFields
    const sourceFields = handleMissingTargetStepIds(
      structuredClone(step.fields),
      sharedFields,
      step.stepId,
    );

    if (repeatBehaviour.min) {
      // Update source step:
      updatedSteps[i] = {
        ...step,
        fields: sourceFields,
      };

      // Start at 1 to account for source step
      for (let j = 1; j <= repeatBehaviour.min; j++) {
        const repeatStepCount = j;
        const nextStepId = getRepeatStepId(step.stepId, repeatStepCount);
        let currentFields = structuredClone(step.fields);

        // Need to ensure that each fieldConditionalOn in a repeatable behaviour has a `targetStepId`
        currentFields = handleMissingTargetStepIds(
          currentFields,
          sharedFields,
          nextStepId,
        );

        const nextStepFields = generateRepeatStepFields(
          currentFields,
          nextStepId,
          undefined,
          sharedBehaviour,
        );

        if (j == repeatBehaviour.min && j != repeatBehaviour.max) {
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
    } else {
      const addAnother = generateRepeatableAddAnotherField(step.stepId);
      const newStepFields = [...sourceFields, addAnother];
      updatedSteps[i] = {
        ...step,
        fields: newStepFields,
      };
    }
    repeatSettings[step.stepId] = repeatConfig;
  }
  return updatedSteps;
};

export const generateRepeatStepFields = (
  currentFields: ClientPrimitive[],
  nextStepId: string,
  addAnotherStepId?: string,
  sharedFieldBehaviour?: SharedFieldsBehaviour,
): ClientPrimitive[] => {
  const nextStepFields = currentFields
    .filter((f) => f.id !== addAnotherStepId)
    .map((field) => {
      return {
        ...field,
        id: getFullFieldId(nextStepId, field.fieldId),
        stepId: nextStepId,
      };
    });

  if (sharedFieldBehaviour) {
    return nextStepFields.filter(
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
    conditionallyHidden: false,
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

export const repeatStepConcactenator = "~";

export const getRepeatStepId = (
  stepId: string,
  repeatStepCount: number,
): string => {
  return `${stepId}${repeatStepConcactenator}${repeatStepCount}`;
};

export const getRepeatStepCount = (stepId: string): number | undefined => {
  const parts = stepId.split(repeatStepConcactenator);
  if (parts.length <= 1) return 0;
  const count = Number(parts[parts.length - 1]);
  return isNaN(count) ? undefined : count;
};

export const addRepeatableStep = ({
  currentStep,
  repeatableStepSettings,
  repeatableBehaviour,
  visibleSteps,
  sharedFieldsBehaviour,
  formMeta,
}: AddRepeatableStepParams): ClientFormStep[] => {
  const [baseStepId, stepRepeatId] = [
    currentStep.stepId.split(repeatStepConcactenator)[0],
    getRepeatStepCount(currentStep.stepId),
  ];

  if (stepRepeatId === undefined) return visibleSteps;

  const currentRepeatConfig = repeatableStepSettings[baseStepId];
  if (!currentRepeatConfig) return visibleSteps;
  if (!repeatableBehaviour) return visibleSteps;
  const repeatableStepCount = currentRepeatConfig.orderedStepIds.length;

  if (repeatableBehaviour.max && repeatableStepCount >= repeatableBehaviour.max)
    return visibleSteps;

  const nextStepId = getRepeatStepId(baseStepId, stepRepeatId + 1);

  if (currentRepeatConfig.orderedStepIds.includes(nextStepId))
    return visibleSteps;

  const nextStepFields = generateRepeatStepFields(
    [...currentStep.fields],
    nextStepId,
    getFullFieldId(currentStep.stepId, "addAnother"),
    sharedFieldsBehaviour,
  );
  if (
    repeatableBehaviour.max &&
    repeatableStepCount < repeatableBehaviour.max - 1
  ) {
    nextStepFields.push(generateRepeatableAddAnotherField(nextStepId));
  }

  currentRepeatConfig.orderedStepIds.push(nextStepId);
  repeatableStepSettings[baseStepId] = currentRepeatConfig;

  const nextStep: ClientFormStep = {
    ...currentStep,
    fields: nextStepFields,
    stepId: nextStepId,
  };

  const currentStepIndex = formMeta.steps.indexOf(currentStep);
  formMeta.steps.splice(currentStepIndex + 1, 0, nextStep); // The real update

  // This is a temporary update that will be replaced when the useMemo recalculates visible steps due to the change in formMeta.steps
  // This is needed, since by the time we call completeAndContinue, the memoized visible steps would not have been recalculated yet
  // Meaning that completeAndContinue will still be operating on the "stale" list of steps.
  // By manually making the update here, and passing it directly to completeAndContinue, completeAndContinue gets to operate on the
  // updated version, or "future state" of visible steps.
  const stepIndex = visibleSteps.indexOf(currentStep);
  const updatedSteps = [...visibleSteps];
  updatedSteps.splice(stepIndex + 1, 0, nextStep);
  return updatedSteps;
};

export const removeRepeatableStep = ({
  currentStep,
  visibleSteps,
  repeatableStepSettings,
  formMeta,
}: RemoveRepeatableStepParams): ClientFormStep[] => {
  const [baseStepId, stepRepeatId] = [
    currentStep.stepId.split(repeatStepConcactenator)[0],
    getRepeatStepCount(currentStep.stepId),
  ];
  if (stepRepeatId === undefined) return visibleSteps;
  const targetStepId = getRepeatStepId(
    baseStepId,
    stepRepeatId ? stepRepeatId + 1 : 1,
  );

  const currentRepeatConfig = repeatableStepSettings[baseStepId];

  if (!currentRepeatConfig.orderedStepIds.includes(targetStepId))
    return visibleSteps;

  const step = visibleSteps.find((s) => s.stepId === targetStepId);
  if (!step) {
    const pos = currentRepeatConfig.orderedStepIds.indexOf(targetStepId);
    if (pos !== -1) {
      currentRepeatConfig.orderedStepIds.splice(
        pos,
        currentRepeatConfig.orderedStepIds.length - 2,
      );
    }
    return visibleSteps;
  }

  const orderedStepIds = [...currentRepeatConfig.orderedStepIds];

  const startIndex = orderedStepIds.indexOf(targetStepId);
  if (startIndex === -1) return visibleSteps;

  const toRemove: string[] = orderedStepIds.slice(startIndex);
  currentRepeatConfig.orderedStepIds = orderedStepIds.slice(0, startIndex);

  if (toRemove.length === 0) return visibleSteps;

  // Remove from formMeta
  const deleteFromIndex = formMeta.steps.findIndex(
    (s) => s.stepId === toRemove[0],
  );

  if (deleteFromIndex !== -1) {
    formMeta.steps.splice(deleteFromIndex, toRemove.length);
  }

  // Filter visible steps
  return visibleSteps.filter((step) => !toRemove.includes(step.stepId));
};

const handleMissingTargetStepIds = (
  currentFields: ClientPrimitive[],
  sharedFields: string[],
  nextStepId: string,
) => {
  currentFields = currentFields.map((field) => {
    field.behaviours = field.behaviours?.map((b) => {
      // If it does not have a targetStepId...
      if (b.type === "fieldConditionalOn" && !b.targetStepId) {
        // If no shared fields, then set it to "nextStepId"
        if (sharedFields.length === 0) b.targetStepId = nextStepId;
        //  And it's not a shared field, then it can have the id of its repeat step.
        else if (!sharedFields.includes(b.targetFieldId))
          b.targetStepId = nextStepId;
        // BUT! If it is a shared field...
        // Then it should have the id of the source step.
        else b.targetStepId = field.stepId;
      }
      return b;
    });
    return { ...field };
  });
  return currentFields;
};
