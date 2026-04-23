import { FormRendererProps } from "@web/types";
import { useNavigate } from "@tanstack/react-router";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React, { useEffect } from "react";
import ErrorSummary from "./error-summary";
import {
  getLastCompletedStep,
  isStepCompleted,
  markStepCompleted,
} from "../lib/session-storage";

export default function FormRenderer({
  form,
  formMeta,
  stepId,
}: FormRendererProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [hidePrevious, setHidePrevious] = React.useState(true);
  const navigate = useNavigate({ from: "/forms/$formId/" });

  const findStepIndexbyId = (stepId: string) => {
    return formMeta.steps.findIndex((formStep) => {
      return formStep.stepId === stepId;
    });
  };

  const navigateToStep = (nextStepIndex: number) => {
    if (nextStepIndex < 0 || nextStepIndex >= formMeta.steps.length) {
      return;
    }

    const nextStepId = formMeta.steps[nextStepIndex].stepId;
    setStepIndex(nextStepIndex);

    void navigate({
      search: (prev) => ({
        ...prev,
        step: nextStepId,
      }),
    });
  };

  useEffect(() => {
    if (stepId) {
      const requestedStepIndex = findStepIndexbyId(stepId);

      setStepIndex(requestedStepIndex >= 0 ? requestedStepIndex : 0);

      if (!isStepCompleted(form._formId, stepId)) {
        const previousStepIndex = requestedStepIndex - 1;

        if (
          previousStepIndex >= 0 &&
          !isStepCompleted(
            form._formId,
            formMeta.steps[previousStepIndex].stepId,
          )
        ) {
          const lastCompletedStepId = getLastCompletedStep(
            form._formId,
            formMeta.steps,
          );
          const lastCompletedStepIndex = lastCompletedStepId
            ? findStepIndexbyId(lastCompletedStepId)
            : -1;
          setStepIndex(
            lastCompletedStepIndex >= 0 ? lastCompletedStepIndex : 0,
          );
          navigateToStep(
            lastCompletedStepIndex >= 0 ? lastCompletedStepIndex : 0,
          );
          return;
        }
      }

      return;
    }

    setStepIndex(0);
  }, [stepId, formMeta.steps]);

  useEffect(() => {
    if (stepIndex === 0) {
      setHidePrevious(true);
    } else {
      setHidePrevious(false);
    }
  }, [stepIndex]);

  const currentStep = formMeta.steps[stepIndex];

  const handlePrevious = () => {
    navigateToStep(stepIndex - 1);
  };

  const handleContinue = () => {
    // TODO: Validate current step before marking as completed and navigating to the next step
    markStepCompleted(form._formId, currentStep.stepId);
    navigateToStep(stepIndex + 1);
  };

  const handleSubmit = () => {};

  return (
    <div className={designSystem.formRoot}>
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>

      <h1>{currentStep.title}</h1>
      {/* {step.description && <p>{step.description}</p>} */}
      {/* TODO: Pass in a complete list of errors */}
      <ErrorSummary />

      <div className={designSystem.formStep}>
        {currentStep.fields.map((field) => (
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
              stepIndex === formMeta.steps.length - 1
                ? handleSubmit
                : handleContinue
            }
          >
            {stepIndex === formMeta.steps.length - 1 ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
