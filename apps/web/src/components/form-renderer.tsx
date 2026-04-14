"use client";
import { FormMeta, FormRendererProps, FormValues } from "@web/types";
import { buildForm } from "@web/lib";
import { useForm } from "@tanstack/react-form";
import FieldRenderer from "./field-renderer";

export default function FormRenderer({ contract }: FormRendererProps) {
  const formMeta: FormMeta = buildForm(contract);

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => {},
  });

  return (
    <>
      <h2> {formMeta.formTitle} </h2>
      <p> {formMeta.formDescription} </p>
      {formMeta.steps.map((step, stepIndex) => (
        <div key={step.stepId}>
          <h2>{step.title}</h2>
          {step.description && <p>{step.description}</p>}

          {step.fields.map((field) => (
            <FieldRenderer key={field.id} form={form} field={field} />
          ))}
          {stepIndex < formMeta.steps.length - 1 && <hr />}
        </div>
      ))}
    </>
  );
}
