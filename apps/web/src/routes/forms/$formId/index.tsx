import { createFileRoute } from "@tanstack/react-router";
import { FormRenderer } from "@web/components";
import { fetchContract, buildForm } from "@web/lib";
import { formSearchParamSchema } from "apps/web/src/types/form-search-param.type";
import { useForm } from "@tanstack/react-form";
import { FormValues } from "@web/types";
import React from "react";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  loader: ({ params }) => {
    return fetchContract(params.formId);
  },
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const contract = Route.useLoaderData();
  const { step } = Route.useSearch();

  const formMeta = buildForm(contract);

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => {
      // TODO: Handle form submission
      console.log("Form submitted:", value);
    },
  });

  return <FormRenderer form={form} formMeta={formMeta} stepId={step} />;
}
