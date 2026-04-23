import { FieldValidationErrors, FormRendererProps } from "@web/types";
import { useNavigate } from "@tanstack/react-router";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React, { useEffect } from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";

export default function FormRenderer({
  form,
  formMeta,
  stepId,
}: FormRendererProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [hidePrevious, setHidePrevious] = React.useState(true);
  const navigate = useNavigate({ from: "/forms/$formId/" });

  useEffect(() => {
    if (stepId) {
      const requestedStepIndex = formMeta.steps.findIndex((formStep) => {
        return formStep.stepId === stepId;
      });

      setStepIndex(requestedStepIndex >= 0 ? requestedStepIndex : 0);
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

  const handlePrevious = () => {
    navigateToStep(stepIndex - 1);
  };

  const handleContinue = () => {
    navigateToStep(stepIndex + 1);
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
      {/* TODO: Pass in a complete list of errors */}
      <ErrorSummary errors={errors} />

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
