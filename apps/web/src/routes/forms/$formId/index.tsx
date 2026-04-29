import { createFileRoute } from "@tanstack/react-router";
import { fetchContract, buildForm, getVisibleSteps } from "@web/lib";
import { FormRenderer, FormError } from "@web/components";
import { formSearchParamSchema } from "apps/web/src/types/form-search-param.type";
import { useForm, useStore } from "@tanstack/react-form";
import { FormRepeatableRecord, FormValues } from "@web/types";
import React from "react";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  errorComponent: FormError,
  loader: ({ params }) => fetchContract(params.formId),
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const contract = Route.useLoaderData();
  const { step } = Route.useSearch();
  const [repeatableRecord, setRepeatableRecord] =
    React.useState<FormRepeatableRecord>({});

  const formMeta = buildForm(contract);

  const form = useForm({
    defaultValues: formMeta.defaultValues as FormValues,
    onSubmit: ({ value }) => {
      // TODO: Handle form submission
      console.log("Form submitted:", value);
    },
  });

  const targetStores = [];

  for (const [stepId, fieldId] of Object.entries(
    formMeta.stepConditionalTargets,
  )) {
    targetStores.push(
      useStore(form.store, (state) => state.values[`${stepId}.${fieldId}`]),
    );
  }

  const visibleSteps = React.useMemo(
    () => getVisibleSteps(formMeta.steps, form),
    [targetStores, formMeta.steps],
  );

  return (
    <FormRenderer
      form={form}
      formMeta={formMeta}
      stepId={step ?? ""}
      visibleSteps={visibleSteps}
      repeatableRecord={repeatableRecord}
      setRepeatableRecord={setRepeatableRecord}
    />
  );
}
