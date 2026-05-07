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
import { RepeatableStepSettings, FormValues, FormMeta } from "@web/types";
import React from "react";
import { getFormData, storeFormData } from "../../../lib/session-storage";
import { postFormSubmission } from "@web/form-api";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  errorComponent: FormError,
  loader: async ({ params }): Promise<FormMeta> => {
    const contract = await fetchContract(params.formId);
    return buildForm(contract);
  },
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const formMeta = Route.useLoaderData();
  const { step } = Route.useSearch();

  const form = useForm({
    defaultValues: {
      ...(formMeta.defaultValues as FormValues),
      ...(getFormData(formMeta.formId) ?? {}),
    },
    onSubmit: async ({ value: values }) => {
      // TODO: Handle form submission
      console.log("Form submitted:", values);
      await postFormSubmission(formMeta, values);
    },
  });

  const repeatableStepSettingsRef = React.useRef<RepeatableStepSettings>(
    formMeta.repeatSettings,
  );

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
      repeatableStepSettingsRef={repeatableStepSettingsRef}
    />
  );
}
