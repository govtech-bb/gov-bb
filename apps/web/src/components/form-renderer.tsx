import { FieldValidationErrors, FormRendererProps } from "@web/types";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React, { useEffect } from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
import { useStepGuard } from "../hooks/use-step-guard";

export default function FormRenderer({
  form,
  formMeta,
  stepId,
}: FormRendererProps) {
  const [stepIndex, setStepIndex] = React.useState(0);
  const [hidePrevious, setHidePrevious] = React.useState(true);
  const { navigateToStep, completeAndContinue } = useStepGuard({
    formId: formMeta.formId,
    steps: formMeta.steps,
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

  const currentStep = formMeta.steps[stepIndex];

  const handlePrevious = () => {
    navigateToStep(stepIndex - 1);
  };

  const handleContinue = () => {
    // TODO: Validate current step before marking as completed and navigating to the next step
    completeAndContinue(currentStep.stepId, stepIndex);
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
        {currentStep.stepId === "check-your-answers" && (
          <div className={designSystem.review}>
            {formMeta.steps
              .filter(
                (step) =>
                  step.stepId !== "check-your-answers" &&
                  step.stepId !== "declaration",
              )
              .map((step) => (
                <div key={step.stepId} className={designSystem.reviewStep}>
                  <div className={designSystem.reviewStepTitle}>
                    <h2>{step.title}</h2>
                    <a href={`/forms/${formMeta.formId}?step=${step.stepId}`}>
                      Change
                    </a>
                  </div>

                  <table className={designSystem.reviewFieldTable}>
                    <tbody>
                      {step.fields.map((field) => (
                        <tr
                          key={field.id}
                          className={designSystem.reviewFieldRow}
                        >
                          <td className={designSystem.reviewFieldLabel}>
                            {field.label}
                          </td>
                          <td className={designSystem.reviewFieldValue}>
                            {form.state.values[field.id] as string}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}

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
