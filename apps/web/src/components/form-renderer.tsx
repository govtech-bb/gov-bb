import {
  ClientFormStep,
  ClientPrimitive,
  FieldValidationErrors,
  FormRendererProps,
} from "@web/types";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React, { useEffect } from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
import { useStepGuard } from "../hooks/use-step-guard";
import Review from "./review";

export default function FormRenderer({
  form,
  formMeta,
  stepId,
  visibleSteps,
  repeatableRecord,
  setRepeatableRecord,
}: FormRendererProps) {
  const [hidePrevious, setHidePrevious] = React.useState(true);
  const [stepIndex, setStepIndex] = React.useState(0);

  const { navigateToStep, completeAndContinue } = useStepGuard({
    formId: formMeta.formId,
    steps: visibleSteps,
    stepId,
    setStepIndex,
  });

  useEffect(() => {
    if (stepIndex === 0) {
      setHidePrevious(true);
    } else {
      setHidePrevious(false);
    }
  }, [stepIndex]);

  const currentStep = visibleSteps[stepIndex];
  const currentFields = [...currentStep.fields];

  const handlePrevious = () => {
    navigateToStep(stepIndex - 1);
  };

  const repeatableBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "repeatable",
  )[0];
  const sharedFieldBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "sharedFields",
  )[0];

  const stepValues = useStore(form.store, (state) => state.values[stepId]);

  const [baseStepId, rawIndex] = stepId.split("--");
  const currentRepeatStepCount = Number(rawIndex ?? 0);

  const stepRepeatableRecord = repeatableRecord[baseStepId];
  const repeatableStepCount = stepRepeatableRecord?.orderedStepIds.length;

  const addRepeatableStep = (): ClientFormStep[] => {
    if (!repeatableBehaviour) return visibleSteps;
    const addAnotherStepRadioId = `${currentStep.stepId}.addAnother-${repeatableStepCount}`;
    const nextStepId = `${baseStepId}--${currentRepeatStepCount + 1}`;

    if (
      stepRepeatableRecord &&
      stepRepeatableRecord.orderedStepIds.includes(nextStepId)
    )
      return visibleSteps;

    let nextStepFields = currentFields
      .filter((f) => f.id != addAnotherStepRadioId)
      .map((field) => {
        field.id = `${nextStepId}.${field.fieldId}`;
        return field;
      });

    if (sharedFieldBehaviour) {
      nextStepFields = nextStepFields.filter(
        (field) => !sharedFieldBehaviour.fieldIds.includes(field.fieldId),
      );
    }

    const updatedRecord = stepRepeatableRecord ?? {
      minRepeats: repeatableBehaviour.min ?? 1,
      maxRepeats: repeatableBehaviour.max ?? 5,
      stepData: {
        [stepId]: stepValues,
      },
      orderedStepIds: [stepId, nextStepId],
      sharedData: {},
    };

    if (stepRepeatableRecord) {
      updatedRecord.stepData[stepId] = stepValues;
      updatedRecord.orderedStepIds.push(nextStepId);
    }

    setRepeatableRecord((prev) => {
      return {
        ...prev,
        [baseStepId]: updatedRecord,
      };
    });

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
    return [
      ...visibleSteps.slice(0, stepIndex + 1),
      nextStep,
      ...visibleSteps.slice(stepIndex + 1),
    ];
  };

  const removeRepeatableStep = (): ClientFormStep[] => {
    const rawIndex = stepId.split("--")[1];
    const index = Number(rawIndex ?? 0);
    const targetStepId = `${baseStepId}--${index ? index : 1}`;

    const record = repeatableRecord[baseStepId];
    if (!record?.orderedStepIds.includes(targetStepId)) return visibleSteps;

    const step = visibleSteps.find((s) => s.stepId === targetStepId);
    if (!step) return visibleSteps;

    const { orderedStepIds } = record;

    const startIndex = orderedStepIds.indexOf(targetStepId);
    if (startIndex === -1) return visibleSteps;

    let toRemove: string[];
    if (index !== 0) {
      // Determine which step IDs to remove (everything after the target)
      toRemove = orderedStepIds.slice(startIndex + 1);
      record.orderedStepIds = orderedStepIds.slice(0, startIndex + 1);
    } else {
      // But if there's only one other element, (removing from the source step) then remove it.
      toRemove = orderedStepIds.slice(startIndex);
      record.orderedStepIds = orderedStepIds.slice(0, startIndex);
    }

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

  const handleContinue = () => {
    // Handle navigation to repeatable step.
    if (repeatableBehaviour) {
      const anotherFieldId = `${currentStep.stepId}.addAnother-${repeatableStepCount}`;

      const anotherFieldValue = form.getFieldValue(anotherFieldId);
      if (anotherFieldValue === "yes") {
        const updatedSteps = addRepeatableStep();
        completeAndContinue(currentStep.stepId, stepIndex, updatedSteps);
        return;
      } else {
        const updatedSteps = removeRepeatableStep();
        completeAndContinue(currentStep.stepId, stepIndex, updatedSteps);
        return;
      }
    }
    // TODO: Validate current step before marking as completed and navigating to the next step
    completeAndContinue(currentStep.stepId, stepIndex);
  };

  if (repeatableBehaviour) {
    const addAnotherField: ClientPrimitive = {
      id: `${currentStep.stepId}.addAnother-${repeatableStepCount}`,
      fieldId: "addAnother",
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

    currentFields.push(addAnotherField);
  }

  const handleSubmit = () => {};

  const errors = useStore(form.store, (state) => {
    const fieldValidationErrors: FieldValidationErrors = {};
    for (const field of currentStep.fields) {
      const fieldErrors = state.fieldMeta[field.id]?.errors ?? [];
      if (fieldErrors.length === 0) continue;
      fieldValidationErrors[field.id] = fieldErrors;
    }
    return fieldValidationErrors;
  });

  return (
    <div className={designSystem.formRoot}>
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>

      <h1>{currentStep.title}</h1>
      {/* {step.description && <p>{step.description}</p>} */}
      {/* TODO: Pass in a complete list of errors */}
      <ErrorSummary errors={errors} />

      <div className={designSystem.formStep}>
        {currentStep.stepId === "check-your-answers" && (
          <Review key={"review-step"} formMeta={formMeta} />
        )}

        {currentFields.map((field) => (
          <FieldRenderer
            key={field.id}
            form={form}
            field={field}
            validationProperties={formMeta.validationProperties[field.id]}
          />
        ))}

        <div className={designSystem.formNavigation}>
          {!hidePrevious && (
            <button
              data-variant="secondary"
              type="button"
              onClick={handlePrevious}
            >
              Previous
            </button>
          )}
          <button
            data-variant="primary"
            type="button"
            onClick={
              stepIndex === visibleSteps.length - 1
                ? handleSubmit
                : handleContinue
            }
          >
            {stepIndex === visibleSteps.length - 1 ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
