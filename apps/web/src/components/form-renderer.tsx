"use client";
import { FormMeta, FormRendererProps, FormValues } from "@web/types";
import { buildForm } from "@web/lib";
import { useForm } from "@tanstack/react-form";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";

export default function FormRenderer({ contract, stepId }: FormRendererProps) {
  const formMeta: FormMeta = buildForm(contract);

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => { },
  });

  let stepIndex = 0;

  if (stepId) {
    stepIndex = formMeta.steps.findIndex((formStep) => {
      return formStep.stepId === stepId
    })
  }

  const currentStep = formMeta.steps[stepIndex]

  return (
    <div className={designSystem.formRoot}>
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>

      <h1>{currentStep.title}</h1>
      {/* {step.description && <p>{step.description}</p>} */}

      <div className={designSystem.formStep}>
        {currentStep.fields.map((field) => (
          <FieldRenderer key={field.id} form={form} field={field} />
        ))}
      </div>

      <div className={designSystem.formNavigation}>
        <button>Previous</button>
        <button>Continue</button>
      </div>
    </div>
  );
}
