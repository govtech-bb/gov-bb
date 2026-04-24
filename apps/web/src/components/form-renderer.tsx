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
  const currentFields = [...currentStep.fields];

  const handlePrevious = () => {
    navigateToStep(stepIndex - 1);
  };

  console.log(formMeta.steps);

  const repeatableBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "repeatable",
  )[0];
  const sharedFieldBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "sharedFields",
  )[0];

  const repeatableStepCount = 1;

  const addRepeatableStep = () => {
    const addAnotherStepRadioId = `${currentStep.stepId}.addAnother-${repeatableStepCount}`;
    const nextStepId = `${currentStep.stepId}-${repeatableStepCount}`;

    let nextStepFields = currentFields.filter(
      (f) => f.id != addAnotherStepRadioId,
    );
    if (sharedFieldBehaviour) {
      nextStepFields = nextStepFields.filter(
        (field) => !sharedFieldBehaviour.fieldIds.includes(field.name),
      );
    }

    const nextStep: ClientFormStep = {
      ...currentStep,
      fields: nextStepFields,
      stepId: nextStepId,
    };

    formMeta.steps.splice(stepIndex + 1, 0, nextStep);
  };

  const removeRepeatableStep = () => {};

  const handleContinue = () => {
    // Handle navigation to repeatable step.

    if (repeatableBehaviour) {
      const anotherFieldId = `${currentStep.stepId}.addAnother-${repeatableStepCount}`;

      const anotherFieldValue = form.getFieldValue(anotherFieldId);
      if (anotherFieldValue === "yes") addRepeatableStep();
    }

    // TODO: Validate current step before marking as completed and navigating to the next step
    completeAndContinue(currentStep.stepId, stepIndex);
  };

  if (repeatableBehaviour) {
    const addAnotherField: ClientPrimitive = {
      id: `${currentStep.stepId}.addAnother-${repeatableStepCount}`,
      name: `${currentStep.stepId}.addAnother-${repeatableStepCount}`,
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
          <Review formMeta={formMeta} form={form} />
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
