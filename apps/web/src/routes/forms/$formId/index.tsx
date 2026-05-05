import { createFileRoute } from "@tanstack/react-router";
import {
  fetchContract,
  buildForm,
  getVisibleSteps,
  getFullFieldId,
} from "@web/lib";
import { FormRenderer, FormError } from "@web/components";
import { formSearchParamSchema } from "apps/web/src/types/form-search-param.type";
import { useForm, useStore } from "@tanstack/react-form";
import { RepeatableStepSettings, FormValues } from "@web/types";
import React from "react";
import { getFormData, storeFormData } from "../../../lib/session-storage";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  errorComponent: FormError,
  loader: ({ params }) => fetchContract(params.formId),
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const contract = Route.useLoaderData();
  const { step } = Route.useSearch();

  const formMeta = React.useMemo(() => buildForm(contract), [contract]);

  const form = useForm({
    defaultValues: {
      ...(formMeta.defaultValues as FormValues),
      ...(getFormData(formMeta.formId) ?? {}),
    },
    onSubmit: ({ value }) => {
      // TODO: Handle form submission
      console.log("Form submitted:", value);
    },
  });

  const [repeatableStepSettings, setRepeatableStepSettings] =
    React.useState<RepeatableStepSettings>(formMeta.repeatSettings);

  const formValues = useStore(
    form.store,
    (state) => state.values,
  ) as FormValues;

  // Persists form data on accidental refresh or navigation
  React.useEffect(() => {
    storeFormData(formMeta.formId, formValues);
  }, [formMeta.formId, formValues]);

  const targetStores = [];

  for (const [stepId, fieldId] of Object.entries(
    formMeta.stepConditionalTargets,
  )) {
    targetStores.push(
      useStore(
        form.store,
        (state) => state.values[getFullFieldId(stepId, fieldId)],
      ),
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
      repeatableStepSettings={repeatableStepSettings}
      setRepeatableStepSettings={setRepeatableStepSettings}
    />
  );
}
