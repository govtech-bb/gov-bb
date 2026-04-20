"use client";
import { FormMeta, FormRendererProps, FormValues } from "@web/types";
import { buildForm } from "@web/lib";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React, { useEffect } from "react";

export default function FormRenderer({ contract, stepId }: FormRendererProps) {
  const formMeta: FormMeta = buildForm(contract);
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

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => { },
  });

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

  return (
    <div className={designSystem.formRoot}>
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>

      <h1>{currentStep.title}</h1>
      {/* {step.description && <p>{step.description}</p>} */}

      <div className={designSystem.formStep}>
        {currentStep.fields.map((field) => (
          <FieldRenderer key={field.id} form={form} field={field} />
        ))}

        <div className={designSystem.formNavigation}>
          {!hidePrevious && (
            <button type="button" onClick={handlePrevious}>
              Previous
            </button>
          )}
          <button type="button" onClick={handleContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
