import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { canDropPreviewToken } from "../../../lib/preview-url";
import {
  getVisibleSteps,
  getVisibleFields,
  getFullFieldId,
  restoreRepeatableStepsFromStorage,
  contractQueryOptions,
  formMetaQueryOptions,
} from "@forms/lib";
import { FormRenderer, FormError, ApplicationClosed } from "@forms/components";
import { isFormClosed } from "@govtech-bb/form-types";
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
import { elapsedSeconds } from "../../../lib/submit-duration";
import { formatDataForSubmission, postFormSubmission } from "@forms/form-api";
import { trackEvent } from "../../../lib/analytics";
import { formCategory } from "../../../lib/form-category";
import {
  resolveSubmissionOutcome,
  applyPaymentReturn,
  clearFormState,
  getFormData,
  storeFormData,
  storeSubmissionState,
  getSubmissionState,
  clearSubmissionState,
  persistFormStartTime,
  getFormStartTime,
  clearFormStartTime,
} from "@govtech-bb/form-renderer";

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
      contractQueryOptions(params.formId, deps.preview, deps.draft),
    );

    // Tier 2: get or build the FormMeta for this specific
    // (version, preview, draft) combination.
    return queryClient.ensureQueryData(
      formMetaQueryOptions(
        params.formId,
        clientContract,
        deps.preview,
        deps.draft,
      ),
    );
  },
  loaderDeps: ({ search }: { search: FormSearchParams }) => ({
    preview: search.preview,
    draft: search.draft,
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
  const { preview } = Route.useSearch();
  const { closingDateTime } = formMeta;
  // #1936: a form past its closing datetime shows the closed page instead of the
  // renderer. Previewing an unpublished recipe (?preview=) bypasses the gate so
  // an operator can still review a closed form. This gate is a wrapper so the
  // form view's hooks are never called conditionally (rules-of-hooks).
  if (
    !preview &&
    closingDateTime &&
    isFormClosed(closingDateTime, new Date())
  ) {
    return (
      <ApplicationClosed
        serviceTitle={formMeta.formTitle}
        closingDateTime={closingDateTime}
        contactDetails={formMeta.contactDetails}
      />
    );
  }
  return <FormView />;
}

function FormView() {
  const formMeta = Route.useLoaderData();
  const { step, preview, draft, source, payment } = Route.useSearch();
  // Only `?draft=` (the DB scratch) blocks submission. `?preview=` serves the
  // published recipe and submits exactly as a citizen would (#1682).
  const isDraft = Boolean(draft);
  const navigate = useNavigate({ from: "/forms/$formId/" });
  // Rehydrate the committed submission outcome on a confirmation-step reload so
  // the renderer doesn't bounce the citizen off it (submissionState is React
  // state and is otherwise lost on refresh). A lazy initialiser — not an effect
  // — so the value is present on the first render, before the renderer's
  // "no submissionState → redirect" effect runs. On any other step this is a
  // fresh session: ignore (and later clear) any stale persisted outcome.
  //
  // When the citizen returns from EzPay (`?payment=success|failed` set by the
  // API's redirect handler), fold that outcome into the rehydrated state so the
  // confirmation flips to the paid receipt / failure panel. sessionStorage
  // survives the same-tab round-trip to EzPay and back, so the stored state
  // (reference, amount, …) is still present to merge into.
  const [submissionState, setSubmissionState] = React.useState<
    SubmissionState | undefined
  >(() => {
    if (step !== "submission-confirmation") return undefined;
    const stored = getSubmissionState(formMeta.formId) ?? undefined;
    return stored ? applyPaymentReturn(stored, payment) : stored;
  });

  React.useEffect(() => {
    trackEvent("form-start", {
      form: formMeta.formId,
      category: formCategory(formMeta.formId),
    });
    persistFormStartTime(formMeta.formId);
  }, [formMeta.formId]);

  // Secret hygiene: once a `?preview=` token has unlocked the form, drop it from
  // the URL (matching landing) so the secret doesn't linger in history. Only
  // where the shared cookie can persist (forms and API same-site) — the API
  // minted it on the first credentialed fetch, so the loader re-runs with a
  // cookie-only fetch and stays unlocked. On cross-site Amplify previews the
  // cookie is inert, so we keep the token or the refetch would 404 (#1646 P3).
  React.useEffect(() => {
    if (!preview) return;
    if (!canDropPreviewToken(window.location.hostname)) return;
    navigate({
      search: (prev) => ({ ...prev, preview: undefined }),
      replace: true,
    });
  }, [preview, navigate]);

  // Mount-only: a fresh load on any step other than the confirmation means we
  // are not viewing a committed outcome, so discard any submissionState left in
  // storage by an earlier submission this session — it must not resurface as a
  // stale confirmation. In-app navigation to the confirmation step does not
  // remount, so the freshly-set state is unaffected.
  React.useEffect(() => {
    if (step !== "submission-confirmation") {
      clearSubmissionState(formMeta.formId);
    }
    // Intentionally mount-only: reads the initial step; deps left empty.
  }, []);

  // Persist the committed outcome so a refresh on the confirmation step can
  // rehydrate it (see the submissionState initialiser above).
  React.useEffect(() => {
    if (submissionState) {
      storeSubmissionState(formMeta.formId, submissionState);
    }
  }, [formMeta.formId, submissionState]);

  const repeatableStepSettingsRef = React.useRef<RepeatableStepSettings>(
    formMeta.repeatSettings,
  );

  // Read session-storage once here so we can use it for both restoration and
  // form default values without issuing two reads.
  const savedFormData = getFormData(formMeta.formId);

  // When a citizen arrives via another form's "Give feedback" link, the URL
  // carries `?source=<originating-formId>`. Seed it into the conventional
  // `referring-service` field (declared by feedback recipes such as the exit
  // survey) so the submission records which form the feedback is about. By
  // convention rather than hard-coding a step id: any recipe that declares a
  // `referring-service` field captures it; forms that don't are unaffected.
  const referringServiceFieldId = source
    ? formMeta.steps
        .flatMap((formStep) => formStep.fields)
        .find((field) => field.fieldId === "referring-service")?.id
    : undefined;
  const sourceDefaults =
    source && referringServiceFieldId
      ? { [referringServiceFieldId]: source }
      : {};

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
      // Spread last so the URL-provided source wins over any stale persisted
      // value for the (read-only) referring-service field.
      ...sourceDefaults,
    },
    onSubmit: async ({ value }) => {
      const values = value as FormValues;
      // Hidden = the complement of the evaluated visible set (#737). The
      // render-mutated conditionallyHidden flag goes stale for fields that
      // never re-mounted after their controlling answer flipped, which
      // would leak de-selected answers into the payload.
      const hiddenFields = visibleSteps.flatMap((step) => {
        const visibleFieldIds = new Set(
          getVisibleFields(step, form).map((field) => field.id),
        );
        return step.fields.filter((field) => !visibleFieldIds.has(field.id));
      });
      const formattedData: FormValuesByStep = formatDataForSubmission(
        values,
        repeatableStepSettingsRef.current,
        hiddenFields,
      );
      let response;
      try {
        response = await postFormSubmission(formMeta, formattedData, preview);
      } catch {
        trackEvent("form-submit-error", {
          form: formMeta.formId,
          category: formCategory(formMeta.formId),
          errors: "network",
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
        trackEvent("form-submit", {
          form: formMeta.formId,
          category: formCategory(formMeta.formId),
          duration_seconds: elapsedSeconds(getFormStartTime(formMeta.formId)),
        });
        clearFormStartTime(formMeta.formId);
      } else if (event) {
        trackEvent("form-submit-error", {
          form: formMeta.formId,
          category: formCategory(formMeta.formId),
          errors: event.reason ?? event.name,
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
      isDraft={isDraft}
      previewToken={preview}
      draftToken={draft}
    />
  );
}
