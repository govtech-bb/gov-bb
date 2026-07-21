import {
  ClientPrimitive,
  FieldValidationErrors,
  FormRendererProps,
  FormValues,
} from "@forms/types";
import FieldRenderer from "./field-renderer";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./markdown-components";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
import { isDateValidationError } from "@govtech-bb/form-validation";
import { useStepGuard } from "../hooks/use-step-guard";
import Review from "./review";
import SubmissionConfirmation from "./submission-confirmation";
import ApplicantNameDisplay from "./applicant-name-display";
import {
  getFullFieldId,
  addRepeatableStep,
  removeRepeatableStep,
  stepFieldIdConcactenator,
  repeatStepConcactenator,
  getRepeatStepCount,
  getInstanceMarker,
  buildFieldValidationProperties,
  collectStepErrorCodes,
} from "@forms/lib";
import { trackEvent } from "../lib/analytics";
import { formCategory } from "../lib/form-category";
import { reviewDwellSeconds } from "./review-dwell";
import { buildValidationErrorPayload } from "./validation-error-event";
import { stepCompleteEventName } from "./step-events";
import { StatusBanner } from "@govtech-bb/react";
import { resolveStepTitle } from "@govtech-bb/form-conditions";
import { buildStepScopedValues } from "../lib/form-builder/helpers/value-tree";

// The feedback form citizens are sent to from a confirmation page, and its
// first step. A root-relative path (not the absolute sandbox URL) so the link
// resolves to whichever environment is serving the form — sandbox, prod, or
// local. The originating form id is appended as `?source=` at render time.
const EXIT_SURVEY_FORM_ID = "exit-survey";
const EXIT_SURVEY_FIRST_STEP = "difficulty-rating";

// ---------------------------------------------------------------------------
// Field grouping (show-hide + radio/select conditional reveal)
// ---------------------------------------------------------------------------

type PlainFieldGroup = { type: "plain"; field: ClientPrimitive };
type ShowHideFieldGroup = {
  type: "show-hide";
  toggle: ClientPrimitive;
  controlled: ClientPrimitive[];
};
/**
 * A radio or single-value select field that has one or more sibling fields
 * that should be revealed inline (inset) when a specific option is selected.
 * Each entry in the map keys on the option value and holds the ordered list
 * of fields to reveal.
 */
type OptionConditionalFieldGroup = {
  type: "option-conditional";
  field: ClientPrimitive;
  conditionalsByOption: Map<string, ClientPrimitive[]>;
};
type FieldGroup =
  | PlainFieldGroup
  | ShowHideFieldGroup
  | OptionConditionalFieldGroup;

/**
 * A field hosts inset conditional reveals when it offers a single-choice
 * option list: radios, or selects without `multiple`. Multi-selects keep the
 * page-level conditional fallback — "equal" against an array value is murky.
 */
function supportsOptionConditionals(field: ClientPrimitive): boolean {
  return (
    field.htmlType === "radio" ||
    (field.htmlType === "select" && !field.multiple)
  );
}

/**
 * Groups fields into rendering units:
 * - show-hide: toggle + its controlled siblings share a bordered container.
 * - option-conditional: a radio/select whose options have inset reveal fields.
 * - plain: everything else.
 */
function buildFieldGroups(fields: ClientPrimitive[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const controlledIds = new Set<string>();

  for (const field of fields) {
    if (controlledIds.has(field.id)) continue;

    if (field.htmlType === "show-hide") {
      const controlled = fields.filter((f) =>
        f.behaviours?.some(
          (b) =>
            b.type === "fieldConditionalOn" &&
            "targetFieldId" in b &&
            b.targetFieldId === field.fieldId,
        ),
      );
      controlled.forEach((f) => controlledIds.add(f.id));
      groups.push({ type: "show-hide", toggle: field, controlled });
    } else if (supportsOptionConditionals(field)) {
      // Collect sibling fields that are revealed by a specific option value
      // on this radio/select (fieldConditionalOn + operator "equal").
      const conditionalsByOption = new Map<string, ClientPrimitive[]>();

      for (const other of fields) {
        if (controlledIds.has(other.id) || other.id === field.id) continue;

        const revealBehaviour = other.behaviours?.find(
          (b) =>
            b.type === "fieldConditionalOn" &&
            "targetFieldId" in b &&
            b.targetFieldId === field.fieldId &&
            "operator" in b &&
            b.operator === "equal",
        );

        if (revealBehaviour && "value" in revealBehaviour) {
          const optionValue = String(revealBehaviour.value);
          if (!conditionalsByOption.has(optionValue)) {
            conditionalsByOption.set(optionValue, []);
          }
          conditionalsByOption.get(optionValue)!.push(other);
          controlledIds.add(other.id);
        }
      }

      if (conditionalsByOption.size > 0) {
        groups.push({
          type: "option-conditional",
          field,
          conditionalsByOption,
        });
      } else {
        groups.push({ type: "plain", field });
      }
    } else {
      groups.push({ type: "plain", field });
    }
  }

  return groups;
}

export default function FormRenderer({
  form,
  formMeta,
  stepId,
  visibleSteps,
  repeatableStepSettingsRef,
  submissionState,
  isDraft = false,
  previewToken,
  draftToken,
}: FormRendererProps) {
  const { navigateToStep, completeAndContinue, currentIndex } = useStepGuard({
    formId: formMeta.formId,
    activeSteps: visibleSteps,
    currentStepId: stepId,
  });

  // currentIndex is -1 for the brief moment the guard effect is redirecting
  // away from a step that was just hidden by a condition change.
  const stepIndex = Math.max(0, currentIndex);
  const hidePrevious = currentIndex <= 0;

  const currentStep = visibleSteps[stepIndex] ?? visibleSteps[0];

  React.useEffect(() => {
    if (!currentStep) return;
    trackEvent("form-step-view", {
      form: formMeta.formId,
      category: formCategory(formMeta.formId),
      step: currentStep.stepId,
    });
  }, [currentStep?.stepId, formMeta.formId, stepIndex, visibleSteps.length]);

  // submissionState is rehydrated from session storage, so a refresh on the
  // confirmation step normally keeps the committed outcome. If it is still
  // absent (e.g. the step was reached without a submission), there is nothing
  // genuine to confirm — bounce back to check-your-answers (the same target as
  // "Try again") rather than render an empty confirmation.
  React.useEffect(() => {
    if (currentStep?.stepId === "submission-confirmation" && !submissionState) {
      navigateToStep("check-your-answers");
    }
  }, [currentStep?.stepId, submissionState, navigateToStep]);

  const reviewEnteredAt = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (currentStep?.stepId === "check-your-answers") {
      reviewEnteredAt.current = Date.now();
      return () => {
        // Fires when the user leaves the review step (advance or back).
        trackEvent("form-review", {
          form: formMeta.formId,
          category: formCategory(formMeta.formId),
          duration_seconds: reviewDwellSeconds(reviewEnteredAt.current),
        });
        reviewEnteredAt.current = null;
      };
    }
  }, [currentStep?.stepId, formMeta.formId]);

  if (!currentStep) return null;

  // The step body (and all its hooks) lives in a child that only mounts once we
  // have a step, so those hooks are never called conditionally — mirrors the
  // RouteComponent → FormView split in routes/forms/$formId (#1981).
  return (
    <ActiveStep
      form={form}
      formMeta={formMeta}
      stepId={stepId}
      currentStep={currentStep}
      stepIndex={stepIndex}
      hidePrevious={hidePrevious}
      visibleSteps={visibleSteps}
      repeatableStepSettingsRef={repeatableStepSettingsRef}
      submissionState={submissionState}
      isDraft={isDraft}
      previewToken={previewToken}
      draftToken={draftToken}
      navigateToStep={navigateToStep}
      completeAndContinue={completeAndContinue}
    />
  );
}

type StepGuard = ReturnType<typeof useStepGuard>;

interface ActiveStepProps extends FormRendererProps {
  currentStep: FormRendererProps["visibleSteps"][number];
  stepIndex: number;
  hidePrevious: boolean;
  navigateToStep: StepGuard["navigateToStep"];
  completeAndContinue: StepGuard["completeAndContinue"];
}

/**
 * Renders the active step. Split out of FormRenderer so every hook here runs
 * unconditionally — FormRenderer's `if (!currentStep) return null` guard sits
 * above this component, so `currentStep` is always present by the time we're
 * here (#1981).
 */
function ActiveStep({
  form,
  formMeta,
  stepId,
  currentStep,
  stepIndex,
  hidePrevious,
  visibleSteps,
  repeatableStepSettingsRef,
  submissionState,
  isDraft = false,
  previewToken,
  draftToken,
  navigateToStep,
  completeAndContinue,
}: ActiveStepProps) {
  const currentFields = [...currentStep.fields];

  // #801: distinguish repeat instances beyond the first. undefined for base
  // steps / first instances (renders exactly as before).
  const instanceMarker = getInstanceMarker(currentStep);

  // Resolve the validators for a field. Pre-built validators live in
  // formMeta.validationProperties (keyed by field id), but repeat-instance
  // fields (`step~N_*`) are created after buildValidation runs, so they have no
  // entry. Fall back to building them from the field's own `validations` so
  // every repeat instance is validated like the first. (See #432.)
  const resolveValidators = (field: ClientPrimitive) =>
    formMeta.validationProperties[field.id] ??
    buildFieldValidationProperties(field);

  const handlePrevious = () => {
    const prevStep = visibleSteps[stepIndex - 1];
    if (prevStep) {
      trackEvent("form-step-back", {
        form: formMeta.formId,
        category: formCategory(formMeta.formId),
        step: currentStep.stepId,
      });
      navigateToStep(prevStep.stepId);
    }
  };

  const repeatableStepValues = useStore(
    form.store,
    (state) =>
      Object.fromEntries(
        Object.entries(state.values).filter(([key]) =>
          key.startsWith(`${stepId}${stepFieldIdConcactenator}`),
        ),
      ) as FormValues,
  );

  React.useEffect(() => {
    if (!repeatableStepValues) return;
    const [baseStepId, stepRepeatId] = [
      currentStep.stepId.split(repeatStepConcactenator)[0],
      getRepeatStepCount(currentStep.stepId),
    ];
    const repeatableStepSettings =
      repeatableStepSettingsRef.current[baseStepId];
    if (repeatableStepSettings === undefined || stepRepeatId === undefined)
      return;

    repeatableStepSettings.stepData[currentStep.stepId] = repeatableStepValues;

    // If this is the source step (that contains shared fields)
    if (repeatableStepSettings.sharedData && stepRepeatId === 0) {
      // Then set those shared fields
      for (const [stepFieldId, fieldValue] of Object.entries(
        repeatableStepValues,
      )) {
        const fieldId = stepFieldId.split(stepFieldIdConcactenator)[1];
        if (!fieldId) continue;
        if (repeatableStepSettings.sharedData[fieldId] !== undefined)
          repeatableStepSettings.sharedData[fieldId] = fieldValue;
      }
    }
  }, [repeatableStepValues]);

  const repeatableStepSettings = repeatableStepSettingsRef.current;
  const handleContinue = async () => {
    // Validate current step fields
    const results = await Promise.all(
      currentFields.map((field) => form.validateField(field.id, "submit")),
    );

    const scrollToTop = () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth", // Smooth animation
      });
    };

    const hasError = results.some((r) => r.length > 0);
    if (hasError) {
      trackEvent(
        "form-validation-error",
        buildValidationErrorPayload(
          formMeta.formId,
          formCategory(formMeta.formId),
          currentStep.stepId,
          collectStepErrorCodes(
            currentFields,
            form.state.values as Record<string, unknown>,
          ),
        ),
      );
      scrollToTop();
      return;
    }

    // Handle navigation to repeatable step.
    const repeatableBehaviour = currentStep.behaviours?.filter(
      (b) => b.type === "repeatable",
    )[0];
    const sharedFieldsBehaviour = currentStep.behaviours?.filter(
      (b) => b.type === "sharedFields",
    )[0];

    if (repeatableBehaviour) {
      const anotherFieldId = getFullFieldId(currentStep.stepId, "addAnother");

      const anotherFieldValue = form.getFieldValue(anotherFieldId);
      // Per-step completion events (<formId>:form-step-<word>) are not fired for
      // repeatable add/remove transitions — out of v1 analytics scope. The next
      // form-step-view still fires.
      if (anotherFieldValue === "yes") {
        const updatedSteps = addRepeatableStep({
          currentStep,
          repeatableBehaviour,
          sharedFieldsBehaviour,
          visibleSteps,
          formMeta,
          repeatableStepSettings,
        });
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      } else if (anotherFieldValue === "no") {
        const updatedSteps = removeRepeatableStep({
          currentStep,
          visibleSteps,
          formMeta,
          repeatableStepSettings: repeatableStepSettings,
        });

        // removeRepeatableStep prunes the step list but leaves the removed
        // instances' values in the form store. storeFormData would re-persist
        // them and restoreRepeatableStepsFromStorage would resurrect the steps
        // on refresh — sending the user back to a "step" they declined. Purge
        // the removed instances' field values so they stay gone. (#432)
        const remainingStepIds = new Set(updatedSteps.map((s) => s.stepId));
        for (const step of visibleSteps) {
          if (remainingStepIds.has(step.stepId)) continue;
          for (const field of step.fields) {
            form.deleteField(field.id);
          }
        }

        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      }
    }
    const nextStep = visibleSteps[stepIndex + 1];
    if (nextStep) {
      // Pre-qualified name (contains ":") so trackEvent forwards it as-is.
      trackEvent(stepCompleteEventName(formMeta.formId, stepIndex), {
        form: formMeta.formId,
        category: formCategory(formMeta.formId),
        step: currentStep.stepId,
      });
    }
    completeAndContinue(currentStep.stepId);
  };

  const handleSubmit = async () => {
    await form.handleSubmit();
    // handleSubmit resolves even when validation fails, so only advance when the
    // form is valid — otherwise the user would be moved past their own errors.
    if (form.state.isValid) {
      completeAndContinue(currentStep.stepId);
    }
  };

  const errors = useStore(form.store, (state) => {
    const fieldValidationErrors: FieldValidationErrors = {};
    for (const field of currentStep.fields) {
      const fieldErrors = state.fieldMeta[field.id]?.errors ?? [];
      if (fieldErrors.length === 0) continue;
      // Date fields emit structured { message, parts } errors; the summary
      // only needs the message text.
      fieldValidationErrors[field.id] = fieldErrors.map((e: unknown) =>
        isDateValidationError(e) ? e.message : String(e),
      );
    }
    return fieldValidationErrors;
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  const isSubmissionConfirmation =
    currentStep.stepId === "submission-confirmation";
  // The form is submitted from whichever step sits immediately before the
  // submission-confirmation step. For standard recipes that is `declaration`;
  // surveys with no declaration (e.g. the exit survey) submit from the
  // build-form-injected check-your-answers step instead. Matching `declaration`
  // explicitly as well keeps every existing recipe identical — across all
  // recipes that carry one, declaration is always the step before confirmation,
  // so the two clauses never disagree (and never yield two submit steps).
  const isLastFormStep =
    currentStep.stepId === "declaration" ||
    visibleSteps[stepIndex + 1]?.stepId === "submission-confirmation";
  // Build show-hide groups so the left-border content wrapper spans the toggle
  // hint AND all conditionally-controlled sibling fields.
  const fieldGroups = buildFieldGroups(currentFields);

  // Reactively read every show-hide toggle value so the content wrapper
  // appears/disappears when the user clicks the toggle.
  const showHideValues = useStore(form.store, (state) => {
    const values = state.values as Record<string, unknown>;
    const result: Record<string, boolean> = {};
    for (const group of fieldGroups) {
      if (group.type === "show-hide") {
        result[group.toggle.id] = !!values[group.toggle.id];
      }
    }
    return result;
  });

  // Resolve the step's effective title reactively: a step may carry
  // `conditionalTitle` overrides (#871) that depend on an earlier answer, so the
  // heading must recompute when the watched value changes. `resolveStepTitle`
  // returns the static title unchanged for steps without overrides.
  const resolvedStepTitle = useStore(form.store, (state) =>
    resolveStepTitle(
      currentStep,
      buildStepScopedValues(state.values as Record<string, unknown>),
    ),
  );

  // A content-only step carries `markdownContent` and no fields (e.g. an intro
  // page). Its markdown supplies its own headings, so we suppress the default
  // step `<h1>` to avoid a duplicate heading.
  const isContentStep =
    !!currentStep.markdownContent && currentStep.fields.length === 0;

  // The submission confirmation owns its own full-width layout (a full-bleed
  // banner plus inner containers), so it renders outside the page container.
  if (isSubmissionConfirmation) {
    // Link to the exit survey, tagging the originating form id so the survey
    // submission records which service the feedback is about. Suppressed on the
    // exit survey itself so it never invites feedback on the feedback form.
    const feedbackUrl =
      formMeta.formId === EXIT_SURVEY_FORM_ID
        ? undefined
        : `/forms/${EXIT_SURVEY_FORM_ID}?step=${EXIT_SURVEY_FIRST_STEP}&source=${encodeURIComponent(
            formMeta.formId,
          )}`;
    return (
      <div className="form-page-confirmation">
        <SubmissionConfirmation
          key={"submission-confirmation"}
          serviceTitle={formMeta.formTitle}
          stepTitle={resolvedStepTitle}
          processingMessage={currentStep.description}
          nextSteps={currentStep.nextSteps}
          markdownContent={currentStep.markdownContent}
          contactDetails={formMeta.contactDetails}
          onTryAgain={() => navigateToStep("check-your-answers")}
          submissionState={submissionState}
          feedbackUrl={feedbackUrl}
        />
      </div>
    );
  }

  return (
    <div className="container pb-8 lg:pb-16">
      <div className="form-page form-width">
        {isDraft && (
          <StatusBanner variant="service-issue" data-testid="draft-banner">
            Draft mode — this is an unpublished draft and cannot be submitted.
          </StatusBanner>
        )}
        <div className="form-page__header">
          <p className="form-page__service-title"> {formMeta.formTitle} </p>
          {!isContentStep && (
            <h1 className="govbb-text-h1">
              {/* GOV.UK caption-in-heading pattern: the caption sits inside the
                h1 so the accessible name distinguishes repeat instances for
                screen-reader heading navigation. */}
              {instanceMarker?.hasLabel && (
                <span
                  data-testid="repeat-instance-marker"
                  className="block text-caption text-mid-grey-00"
                >
                  {instanceMarker.text}
                </span>
              )}
              {instanceMarker && !instanceMarker.hasLabel
                ? `${resolvedStepTitle} — ${instanceMarker.text}`
                : resolvedStepTitle}
            </h1>
          )}
          {currentStep.description && (
            <p className="form-page__step-description">
              {currentStep.description}
            </p>
          )}
        </div>
        <ErrorSummary errors={errors} />

        <div className="form-page__step">
          {currentStep.markdownContent && (
            <div className="form-page__markdown-content">
              {/* Recipe-authored step copy (e.g. an intro page). react-markdown
                  escapes raw HTML by default and we omit rehype-raw, so recipe
                  content cannot inject markup. */}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {currentStep.markdownContent}
              </ReactMarkdown>
            </div>
          )}

          {currentStep.stepId === "check-your-answers" && (
            <Review
              key={"review-step"}
              formMeta={formMeta}
              form={form}
              visibleSteps={visibleSteps}
            />
          )}

          {currentStep.stepId === "declaration" && (
            <ApplicantNameDisplay form={form} />
          )}

          {fieldGroups.map((group) => {
            if (group.type === "show-hide") {
              const isOpen = showHideValues[group.toggle.id] ?? false;
              return (
                <React.Fragment key={group.toggle.id}>
                  {/* Toggle (<details>/<summary>) — the hint and controlled
                    fields live outside the FieldRenderer so we can wrap them all
                    in the govbb-show-hide content border */}
                  <FieldRenderer
                    form={form}
                    field={group.toggle}
                    validationProperties={resolveValidators(group.toggle)}
                    formId={formMeta.formId}
                    previewToken={previewToken}
                    draftToken={draftToken}
                  />
                  {isOpen && (
                    <div className="govbb-show-hide__content">
                      {group.toggle.hint && (
                        <p className="govbb-hint">{group.toggle.hint}</p>
                      )}
                      {group.controlled.map((field) => (
                        <FieldRenderer
                          key={field.id}
                          form={form}
                          field={field}
                          validationProperties={resolveValidators(field)}
                          formId={formMeta.formId}
                          previewToken={previewToken}
                          draftToken={draftToken}
                        />
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            }

            if (group.type === "option-conditional") {
              // Build a map of option value → [{field, validationProperties}]
              // so the radio/select FieldRenderer can render inset fields per
              // option.
              const insetFieldsByOption = new Map(
                [...group.conditionalsByOption.entries()].map(
                  ([optVal, insetFields]) => [
                    optVal,
                    insetFields.map((f) => ({
                      field: f,
                      validationProperties: resolveValidators(f),
                    })),
                  ],
                ),
              );

              return (
                <FieldRenderer
                  key={group.field.id}
                  form={form}
                  field={group.field}
                  validationProperties={resolveValidators(group.field)}
                  insetFieldsByOption={insetFieldsByOption}
                  formId={formMeta.formId}
                  previewToken={previewToken}
                />
              );
            }

            return (
              <FieldRenderer
                key={group.field.id}
                form={form}
                field={group.field}
                validationProperties={resolveValidators(group.field)}
                formId={formMeta.formId}
                previewToken={previewToken}
              />
            );
          })}

          {currentStep.stepId !== "submission-confirmation" && (
            <div className="govbb-btn-group">
              {!hidePrevious && (
                <button
                  className="govbb-btn--secondary"
                  type="button"
                  onClick={handlePrevious}
                >
                  Previous
                </button>
              )}
              <button
                className="govbb-btn"
                type="button"
                disabled={
                  (isLastFormStep && isSubmitting) ||
                  (isLastFormStep && isDraft)
                }
                onClick={isLastFormStep ? handleSubmit : handleContinue}
              >
                {isLastFormStep && isSubmitting
                  ? "Submitting…"
                  : isLastFormStep && isDraft
                    ? "Submit (draft)"
                    : isLastFormStep
                      ? "Submit"
                      : "Continue"}
              </button>
            </div>
          )}
          {currentStep.stepId !== "submission-confirmation" &&
            isLastFormStep &&
            isDraft && (
              <p className="govbb-hint" data-testid="draft-submit-hint">
                Submitting is disabled for an unpublished draft. Set the
                form&apos;s visibility to Preview or Public and publish it to
                enable submission.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
