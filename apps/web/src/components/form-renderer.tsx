import {
  ClientFormStep,
  FieldValidationErrors,
  FormRendererProps,
} from "@web/types";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
import { useStepGuard } from "../hooks/use-step-guard";
import Review from "./review";
import {
  getFullFieldId,
  repeatStepConcactenator,
  addRepeatableStep,
  removeRepeatableStep,
} from "@web/lib";

export default function FormRenderer({
  form,
  formMeta,
  stepId,
  visibleSteps,
  repeatableStepSettingsRef,
}: FormRendererProps) {
  const { navigateToStep, completeAndContinue, currentIndex } = useStepGuard({
    formId: formMeta.formId,
    activeSteps: visibleSteps,
    currentStepId: stepId,
  });

  // currentIndex is -1 for the brief moment the guard effect is redirecting
  // away from a step that was just hidden by a condition change.
  const stepIndex = Math.max(0, currentIndex);
  const hidePrevious = currentIndex <= 0;

  const currentStep = visibleSteps[stepIndex] ?? visibleSteps[0];
  if (!currentStep) return null;

  const currentFields = [...currentStep.fields];

  const handlePrevious = () => {
    const prevStep = visibleSteps[stepIndex - 1];
    if (prevStep) navigateToStep(prevStep.stepId);
  };

  const repeatableBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "repeatable",
  )[0];
  const sharedFieldsBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "sharedFields",
  )[0];

  const stepValues = useStore(form.store, (state) => state.values[stepId]);

  const baseStepId = stepId.split(repeatStepConcactenator)[0];
  const repeatableStepSettings = repeatableStepSettingsRef.current;
  const handleContinue = () => {
    // Handle navigation to repeatable step.
    if (repeatableBehaviour) {
      const anotherFieldId = getFullFieldId(currentStep.stepId, "addAnother");

      const anotherFieldValue = form.getFieldValue(anotherFieldId);
      if (anotherFieldValue === "yes") {
        const { updatedSteps, updatedConfig } = addRepeatableStep({
          currentStep,
          repeatableBehaviour,
          sharedFieldsBehaviour,
          visibleSteps,
          stepValues,
          formMeta,
          currentRepeatConfig: repeatableStepSettings[baseStepId],
        });
        if (updatedConfig) {
          repeatableStepSettings[baseStepId] = updatedConfig;
        }
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      } else if (anotherFieldValue === "no") {
        const updatedSteps = removeRepeatableStep({
          currentStep,
          visibleSteps,
          formMeta,
          currentRepeatConfig: repeatableStepSettings[baseStepId],
        });
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      }
    }
    completeAndContinue(currentStep.stepId);
  };

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
      <ErrorSummary errors={errors} />

      <div className={designSystem.formStep}>
        {currentStep.stepId === "check-your-answers" && (
          <Review key={"review-step"} formMeta={formMeta} form={form} />
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
