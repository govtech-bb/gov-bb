import { createFileRoute } from "@tanstack/react-router";
import {
  getVisibleSteps,
  getFullFieldId,
  restoreRepeatableStepsFromStorage,
  contractQueryOptions,
  formMetaQueryOptions,
} from "@forms/lib";
import { FormRenderer, FormError } from "@forms/components";
import { formSearchParamSchema } from "../../../types/form-search-param.type";
import { useForm, useStore } from "@tanstack/react-form";
import {
  RepeatableStepSettings,
  FormValues,
  FormMeta,
  SubmissionState,
  FormSubmissionResponseBody,
  FormValuesByStep,
} from "@forms/types";
import React from "react";
import { getFormData, storeFormData } from "../../../lib/session-storage";
import { formatDataForSubmission, postFormSubmission } from "@forms/form-api";
import { trackEvent } from "../../../lib/analytics";

export const Route = createFileRoute("/forms/$formId/")({
  component: RouteComponent,
  errorComponent: FormError,
  /**
   * Two-tier caching loader:
   *
   * 1. Tier 1 — Fetch (or serve from cache) the ClientServiceContract.
   *    Cache key: ["service-contract", formId, preview | null]
   *    This gives us the current `version` without building the form first.
   *    The preview token (from `?preview=`) is forwarded here so an operator
   *    can preview an unpublished draft.
   *
   * 2. Version check — The formMetaQueryOptions key includes the version.
   *    If a FormMeta for this exact (formId, version) pair is already in the
   *    TanStack Query cache, ensureQueryData returns it immediately (sub-ms).
   *    If the version has changed (or this is the first load), the queryFn
   *    runs buildForm() and the result is stored under the new key.
   *
   *    Cache key: ["form-schema", formId, version]
   *
   * On navigation back to this route, the first call resolves from the
   * in-memory cache; the contract re-validates after 60 s in the background
   * so version bumps are caught on the next full navigation.
   */
  loader: async ({ params, context, deps }): Promise<FormMeta> => {
    const { queryClient } = context;

    // Tier 1: get the contract (from cache or server).
    const clientContract = await queryClient.ensureQueryData(
      contractQueryOptions(params.formId, deps.preview),
    );

    // Tier 2: get or build the FormMeta for this specific version.
    return queryClient.ensureQueryData(
      formMetaQueryOptions(params.formId, clientContract),
    );
  },
  loaderDeps: ({ search }) => ({ preview: search.preview }),
  validateSearch: (search) => formSearchParamSchema.parse(search),
});

function RouteComponent() {
  const formMeta = Route.useLoaderData();
  const { step } = Route.useSearch();
  const [submissionState, setSubmissionState] = React.useState<
    SubmissionState | undefined
  >(undefined);

  React.useEffect(() => {
    trackEvent("form-open", { form_id: formMeta.formId });
  }, [formMeta.formId]);

  const repeatableStepSettingsRef = React.useRef<RepeatableStepSettings>(
    formMeta.repeatSettings,
  );

  // Read session-storage once here so we can use it for both restoration and
  // form default values without issuing two reads.
  const savedFormData = getFormData(formMeta.formId);

  // Re-create any extra repeatable-step instances the user had added before
  // the refresh.  Must happen before useForm so the saved field values land
  // on the correct (restored) steps.
  const hasRestoredRef = React.useRef(false);
  if (!hasRestoredRef.current) {
    if (savedFormData) {
      restoreRepeatableStepsFromStorage(
        savedFormData,
        formMeta,
        repeatableStepSettingsRef.current,
      );
    }
    hasRestoredRef.current = true;
  }

  const form = useForm({
    defaultValues: {
      ...(formMeta.defaultValues as FormValues),
      ...(savedFormData ?? {}),
    },
    onSubmit: async ({ value }) => {
      const values = value as FormValues;
      const hiddenFields = visibleSteps
        .map((step) => step.fields)
        .flat()
        .filter((field) => field.hidden || field.conditionallyHidden);
      const formattedData: FormValuesByStep = formatDataForSubmission(
        values,
        repeatableStepSettingsRef.current,
        hiddenFields,
      );
      let response;
      try {
        response = await postFormSubmission(formMeta, formattedData);
      } catch {
        trackEvent("form-submit-error", {
          form_id: formMeta.formId,
          reason: "network",
        });
        return;
      }
      const responseData: FormSubmissionResponseBody = response.data;

      let subState: SubmissionState;
      const baseSubState = {
        referenceNumber: responseData.id,
        date: responseData.submittedAt,
        serviceName: responseData.formId,
      };

      switch (response.status) {
        case "submitted":
        case "success":
        case "complete":
          subState = {
            submissionSuccess: true,
            hasPayment: false, // Get this value from response
            ...baseSubState,
          };
          setSubmissionState(subState);
          trackEvent("form-submit-success", {
            form_id: formMeta.formId,
            step_count: visibleSteps.length,
          });
          break;
        case "processing":
          break;
        case "draft":
          break;
        case "pending_payment":
          if (response.meta?.deferred) {
            const { amount, paymentUrl, paymentId, description } =
              response.meta?.deferred;
            subState = {
              ...baseSubState,
              submissionSuccess: true,
              hasPayment: true,
              amount: amount.toString(),
              paymentUrl,
              paymentId,
              paymentDescription: description,
            };
          }
          trackEvent("form-submit-success", {
            form_id: formMeta.formId,
            step_count: visibleSteps.length,
          });
          break;
        case "failed":
        case "error":
          //TODO: Add state handling for errors
          trackEvent("form-submit-error", {
            form_id: formMeta.formId,
            reason: "server",
          });
          break;
        default:
          console.error("Have no idea what to do here");
      }
    },
  });

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
      submissionState={submissionState}
    />
  );
}
