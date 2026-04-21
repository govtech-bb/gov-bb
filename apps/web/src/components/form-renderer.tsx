"use client";
import { FormMeta, FormRendererProps, FormValues } from "@web/types";
import { buildForm } from "@web/lib";
import { useForm } from "@tanstack/react-form";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";

export default function FormRenderer({ contract }: FormRendererProps) {
  const formMeta: FormMeta = buildForm(contract);

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => { },
  });

  return (
    <div className={designSystem.formRoot}>
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>
      {formMeta.formDescription && <p className={designSystem.formDescription}> {formMeta.formDescription} </p>}
      {formMeta.steps.map((step, stepIndex) => (
        <div key={step.stepId} className={designSystem.formStep}>
          <h1>{step.title}</h1>
          {step.description && <p className={designSystem.formStepDescription}>{step.description}</p>}

          {step.fields.map((field) => (
            <FieldRenderer key={field.id} form={form} field={field} />
          ))}
          {stepIndex < formMeta.steps.length - 1 && <hr />}
        <button type="submit" data-variant="secondary">Previous</button>
        <button type="submit" data-variant="primary">Continue</button>
        </div>
        
      ))}
    </div>
  );
}
