import {
  ClientFormStep,
  ClientPrimitive,
  RepeatableStepSettings,
  RepeatableConfig,
  AddRepeatableStepParams,
  RemoveRepeatableStepParams,
  FormValues,
  FormMeta,
} from "@forms/types";
import { getFullFieldId } from "@forms/lib";
import {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";

// #771: min/max are 1-based totals. Legacy recipes may carry min: 0 (old
// "base step only" semantics — renders identically to min: 1), a missing
// max ("unlimited"), or junk; normalise once so the branch logic only ever
// sees min >= 1 and a usable cap.
export const getEffectiveRepeatBounds = (
  behaviour: RepeatableBehaviour,
): { min: number; max: number } => {
  const min = Math.max(1, Math.floor(behaviour.min) || 1);
  const max =
    Math.floor(behaviour.max) >= min ? Math.floor(behaviour.max) : Infinity;
  return { min, max };
};

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

    const sharedFieldsIds: string[] = sharedBehaviour?.fieldIds ?? [];
    const sharedData: FormValues = {};

    for (const sharedFieldId of sharedFieldsIds) sharedData[sharedFieldId] = "";

    // Need to see if this is the original step

    const repeatStepCount = getRepeatStepCount(step.stepId);
    // If not the original, just skip
    if (repeatStepCount === undefined || repeatStepCount > 0) continue;

    // Normalise bounds once: min >= 1, max is a usable finite cap or Infinity.
    const { min, max } = getEffectiveRepeatBounds(repeatBehaviour);

    // We can setup the config first.
    const repeatConfig: RepeatableConfig = {
      minRepeats: min,
      maxRepeats: max,
      orderedStepIds: [step.stepId],
      stepData: {},
      sharedData,
    };

    // Update fields for source step based on sharedFields
    const sourceFields = handleMissingTargetStepIds(
      structuredClone(step.fields),
      sharedFieldsIds,
      step.stepId,
    );

    const hasSharedFields = sharedFieldsIds.length > 0;

    if (hasSharedFields) {
      // Shared-fields steps: the source step is a separate "shared values" page
      // (it holds the shared fields, filled once) and the minimum repeat
      // instances are materialised as ~1..~min. The "Add another?" control sits
      // on the last generated instance.
      updatedSteps[i] = {
        ...step,
        fields: sourceFields,
      };

      // Start at 1 to account for source step
      for (let j = 1; j <= min; j++) {
        const repeatStepCount = j;
        const nextStepId = getRepeatStepId(step.stepId, repeatStepCount);
        let currentFields = structuredClone(step.fields);

        // Need to ensure that each fieldConditionalOn / optionalIf in a repeatable behaviour has a `targetStepId`
        currentFields = handleMissingTargetStepIds(
          currentFields,
          sharedFieldsIds,
          nextStepId,
        );

        const nextStepFields = generateRepeatStepFields(
          currentFields,
          nextStepId,
          undefined,
          sharedBehaviour,
        );

        if (j == min && j != max) {
          const addAnother = generateRepeatableAddAnotherField(
            nextStepId,
            repeatBehaviour.addAnotherLabel,
          );
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
      // No shared fields: the source step IS the first instance. Render
      // min instances total (so min=1 shows a single instance, not a
      // duplicate pair) and put the "Add another?" control on the last one
      // when the user can still add more.
      const totalInstances = min;
      const canAddMore = totalInstances < max;

      updatedSteps[i] = {
        ...step,
        fields:
          totalInstances === 1 && canAddMore
            ? [
                ...sourceFields,
                generateRepeatableAddAnotherField(
                  step.stepId,
                  repeatBehaviour.addAnotherLabel,
                ),
              ]
            : sourceFields,
      };

      for (let j = 1; j <= totalInstances - 1; j++) {
        const nextStepId = getRepeatStepId(step.stepId, j);
        let currentFields = structuredClone(step.fields);

        // Need to ensure that each fieldConditionalOn / optionalIf in a repeatable behaviour has a `targetStepId`
        currentFields = handleMissingTargetStepIds(
          currentFields,
          sharedFieldsIds,
          nextStepId,
        );

        const nextStepFields = generateRepeatStepFields(
          currentFields,
          nextStepId,
          undefined,
          sharedBehaviour,
        );

        if (j === totalInstances - 1 && canAddMore) {
          nextStepFields.push(
            generateRepeatableAddAnotherField(
              nextStepId,
              repeatBehaviour.addAnotherLabel,
            ),
          );
        }

        const nextStep: ClientFormStep = {
          ...step,
          fields: nextStepFields,
          stepId: nextStepId,
        };
        updatedSteps.splice(i + j, 0, nextStep);
        repeatConfig.orderedStepIds.push(nextStepId);
      }
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
  label?: string,
): ClientPrimitive => {
  const addAnotherField: ClientPrimitive = {
    id: getFullFieldId(stepId, "addAnother"),
    fieldId: "addAnother",
    stepId: stepId,
    name: "Add Another",
    label: label ?? "Add another?",
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

// #801: marker that distinguishes repeat instances beyond the first, shown on
// the live step and the review page. Instance 1 is never marked, so a lone
// instance renders exactly as before.
export type RepeatInstanceMarker = {
  // "Dependent 2" when the behaviour configures an instanceLabel, else "2".
  text: string;
  // True when the marker carries a configured instanceLabel — rendered as a
  // caption above the title rather than a title suffix.
  hasLabel: boolean;
};

export const getInstanceMarker = (
  step: ClientFormStep,
): RepeatInstanceMarker | undefined => {
  const count = getRepeatStepCount(step.stepId);
  // Base step (0) is instance 1; undefined means a non-numeric suffix.
  if (!count) return undefined;

  const repeatBehaviour = step.behaviours?.find((b) => b.type === "repeatable");
  const hasSharedFields = step.behaviours?.some(
    (b) => b.type === "sharedFields",
  );

  // Without sharedFields the base step is instance 1 and ~N is instance N+1.
  // With sharedFields the base step is a separate shared-values page and the
  // instances are ~1..~min, so ~N IS instance N (and ~1 stays unmarked).
  const displayNumber = hasSharedFields ? count : count + 1;
  if (displayNumber <= 1) return undefined;

  const label = repeatBehaviour?.instanceLabel;
  return label
    ? { text: `${label} ${displayNumber}`, hasLabel: true }
    : { text: `${displayNumber}`, hasLabel: false };
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

  const { max } = getEffectiveRepeatBounds(repeatableBehaviour);

  if (repeatableStepCount >= max) return visibleSteps;

  const nextStepId = getRepeatStepId(baseStepId, stepRepeatId + 1);

  if (currentRepeatConfig.orderedStepIds.includes(nextStepId))
    return visibleSteps;

  const nextStepFields = generateRepeatStepFields(
    [...currentStep.fields],
    nextStepId,
    getFullFieldId(currentStep.stepId, "addAnother"),
    sharedFieldsBehaviour,
  );
  if (repeatableStepCount < max - 1) {
    nextStepFields.push(
      generateRepeatableAddAnotherField(
        nextStepId,
        repeatableBehaviour.addAnotherLabel,
      ),
    );
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
        currentRepeatConfig.orderedStepIds.length - pos,
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

// Restores any extra repeatable-step instances that were added at runtime
// (via "Add another?") but are absent from `formMeta` after a page refresh.
// On refresh `buildForm` / `setupRepeatSteps` only materialises the minimum
// number of repeat instances from the contract.  Any instances the user added
// beyond that minimum exist only as field values in session storage
// (e.g. `personalInfo~2_firstName`).  This function:
//
//  1. Scans every key in `savedData` and extracts the step-ID prefix
//     (everything before the last `_`, matching the `getFullFieldId` pattern).
//  2. For each base repeatable step in `repeatableStepSettings`, identifies
//     which `baseStep~N` (N > existing min) instances have saved data but are
//     absent from `formMeta.steps`.
//  3. Re-runs `addRepeatableStep` for each missing instance in ascending order
//     so that `formMeta.steps` and `repeatableStepSettings` are brought back
//     to the state they were in before the refresh.
// // Must be called **before** `useForm` is initialised so that default values
// merged from session storage map correctly onto the restored steps.
export const restoreRepeatableStepsFromStorage = (
  savedData: Record<string, unknown>,
  formMeta: FormMeta,
  repeatableStepSettings: RepeatableStepSettings,
): void => {
  // ── 1. Collect every step ID referenced by a saved form-data key ─────────
  // Key format:  `${stepId}_${fieldId}`  (see getFullFieldId)
  // stepId is everything before the last underscore.
  const savedStepIds = new Set<string>();
  for (const key of Object.keys(savedData)) {
    const sep = key.lastIndexOf("_");
    if (sep !== -1) savedStepIds.add(key.substring(0, sep));
  }

  // ── 2. For every base repeatable step, recreate missing instances ─────────
  for (const [baseStepId, config] of Object.entries(repeatableStepSettings)) {
    // Only consider IDs of the form  `baseStep~N`  (repeat count > 0) that
    // aren't already present in the current ordered list.
    const missingInstances = [...savedStepIds]
      .filter(
        (id) =>
          id.startsWith(baseStepId + repeatStepConcactenator) &&
          !config.orderedStepIds.includes(id),
      )
      .sort(
        (a, b) => (getRepeatStepCount(a) ?? 0) - (getRepeatStepCount(b) ?? 0),
      );

    for (const instanceId of missingInstances) {
      const instanceCount = getRepeatStepCount(instanceId) ?? 1;

      // The step that immediately precedes this instance in the sequence.
      const prevStepId =
        instanceCount <= 1
          ? baseStepId
          : getRepeatStepId(baseStepId, instanceCount - 1);

      const prevStep = formMeta.steps.find((s) => s.stepId === prevStepId);
      if (!prevStep) continue;

      const repeatableBehaviour = prevStep.behaviours?.find(
        (b) => b.type === "repeatable",
      ) as RepeatableBehaviour | undefined;

      const sharedFieldsBehaviour = prevStep.behaviours?.find(
        (b) => b.type === "sharedFields",
      ) as SharedFieldsBehaviour | undefined;

      // addRepeatableStep mutates both formMeta.steps and
      // repeatableStepSettings in-place; the returned visibleSteps copy is
      // not needed here.
      addRepeatableStep({
        currentStep: prevStep,
        repeatableStepSettings,
        repeatableBehaviour,
        sharedFieldsBehaviour,
        visibleSteps: formMeta.steps,
        formMeta,
      });
    }
  }
};

const handleMissingTargetStepIds = (
  currentFields: ClientPrimitive[],
  sharedFields: string[],
  nextStepId: string,
) => {
  currentFields = currentFields.map((field) => {
    field.behaviours = field.behaviours?.map((b) => {
      // If it does not have a targetStepId...
      // `optionalIf` is rewritten with the same rules as `fieldConditionalOn`
      // (#668) so it resolves instance-locally inside a repeatable step,
      // matching the server's per-instance evaluation.
      if (
        (b.type === "fieldConditionalOn" || b.type === "optionalIf") &&
        !b.targetStepId
      ) {
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
