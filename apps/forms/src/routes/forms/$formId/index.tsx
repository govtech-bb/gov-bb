import { createFileRoute } from "@tanstack/react-router";
import {
  getVisibleSteps,
  getFullFieldId,
  restoreRepeatableStepsFromStorage,
  contractQueryOptions,
  formMetaQueryOptions,
} from "@forms/lib";
import { FormRenderer, FormError } from "@forms/components";
import {
  formSearchParamSchema,
  type FormSearchParams,
} from "../../../types/form-search-param.type";
import { useForm, useStore, revalidateLogic } from "@tanstack/react-form";
import {
  RepeatableStepSettings,
  FormValues,
  FormMeta,
  SubmissionState,
  FormValuesByStep,
} from "@forms/types";
import React from "react";
import {
  clearFormState,
  getFormData,
  storeFormData,
  storeSubmissionState,
  getSubmissionState,
} from "../../../lib/session-storage";
import { formatDataForSubmission, postFormSubmission } from "@forms/form-api";
import { trackEvent } from "../../../lib/analytics";
import { resolveSubmissionOutcome } from "../../../lib/submission-outcome";

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
   *    Cache key: ["form-schema", formId, version, preview | null]
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

    // Tier 2: get or build the FormMeta for this specific (version, preview) pair.
    return queryClient.ensureQueryData(
      formMetaQueryOptions(params.formId, clientContract, deps.preview),
    );
  },
  loaderDeps: ({ search }: { search: FormSearchParams }) => ({
    preview: search.preview,
  }),
  validateSearch: (search): FormSearchParams =>
    formSearchParamSchema.parse(search),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `Government Services | ${loaderData.formTitle}`
          : "Government Services",
      },
    ],
  }),
});

function RouteComponent() {
  const formMeta = Route.useLoaderData();
  const { step } = Route.useSearch();
  // Rehydrate from session storage so a refresh on the confirmation step keeps
  // the committed outcome instead of bouncing the citizen to check-your-answers.
  const [submissionState, setSubmissionState] = React.useState<
    SubmissionState | undefined
  >(() => getSubmissionState(formMeta.formId));

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
    // Reward early, punish late: hold validation until a submit attempt
    // (each step's Continue triggers validateField(…, "submit")), then
    // revalidate on change so errors clear as the user fixes them.
    validationLogic: revalidateLogic({
      mode: "submit",
      modeAfterSubmission: "change",
    }),
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
        // Commit a failed state so the confirmation step shows the
        // "Something went wrong" panel with a retry, instead of leaving the
        // citizen frozen with no feedback. No response means no reference data.
        setSubmissionState({
          submissionSuccess: false,
          hasPayment: false,
          referenceNumber: "",
          date: "",
          serviceName: formMeta.formId,
        });
        return;
      }

      const { subState, event } = resolveSubmissionOutcome(response);
      if (subState) {
        setSubmissionState(subState);
      }
      if (event?.name === "form-submit-success") {
        // Submission saved server-side — drop the local draft so the next visit
        // starts fresh. Gated on the success event (not submissionSuccess) so
        // the payment-init error path keeps the answers for its Try again flow.
        clearFormState(formMeta.formId);
        trackEvent(event.name, {
          form_id: formMeta.formId,
          step_count: visibleSteps.length,
        });
      } else if (event) {
        trackEvent(event.name, {
          form_id: formMeta.formId,
          reason: event.reason,
        });
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

  // Persist the committed submission outcome so the confirmation step survives
  // a refresh. Each new submission overwrites it under the same form id.
  React.useEffect(() => {
    if (submissionState) {
      storeSubmissionState(formMeta.formId, submissionState);
    }
  }, [formMeta.formId, submissionState]);

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
