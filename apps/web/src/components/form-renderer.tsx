import {
  ClientPrimitive,
  FieldValidationErrors,
  FormRendererProps,
  FormValues,
} from "@web/types";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
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
} from "@web/lib";

// ---------------------------------------------------------------------------
// Field grouping (show-hide + radio conditional reveal)
// ---------------------------------------------------------------------------

type PlainFieldGroup = { type: "plain"; field: ClientPrimitive };
type ShowHideFieldGroup = {
  type: "show-hide";
  toggle: ClientPrimitive;
  controlled: ClientPrimitive[];
};
/**
 * A radio field that has one or more sibling fields that should be revealed
 * inline (inset) when a specific option is selected.  Each entry in the map
 * keys on the option value and holds the ordered list of fields to reveal.
 */
type RadioConditionalFieldGroup = {
  type: "radio-conditional";
  radio: ClientPrimitive;
  conditionalsByOption: Map<string, ClientPrimitive[]>;
};
type FieldGroup =
  | PlainFieldGroup
  | ShowHideFieldGroup
  | RadioConditionalFieldGroup;

/**
 * Groups fields into rendering units:
 * - show-hide: toggle + its controlled siblings share a bordered container.
 * - radio-conditional: a radio whose options each have inset reveal fields.
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
    } else if (field.htmlType === "radio") {
      // Collect sibling fields that are revealed by a specific option value
      // on this radio (fieldConditionalOn + operator "equal").
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
          type: "radio-conditional",
          radio: field,
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
  if (!currentStep) return null;

  const currentFields = [...currentStep.fields];

  const handlePrevious = () => {
    const prevStep = visibleSteps[stepIndex - 1];
    if (prevStep) navigateToStep(prevStep.stepId);
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
      currentFields.map((field) => form.validateField(field.id, "change")),
    );

    const scrollToTop = () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth", // Smooth animation
      });
    };

    const hasError = results.some((r) => r.length > 0);
    if (hasError) {
      scrollToTop();
      if (
        !process.env.SKIP_CONTINUE_VALIDATION ||
        process.env.SKIP_CONTINUE_VALIDATION === "false"
      )
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
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      }
    }
    completeAndContinue(currentStep.stepId);
  };

  const handleSubmit = () => {
    form.handleSubmit();
    completeAndContinue(currentStep.stepId);
  };

  const errors = useStore(form.store, (state) => {
    const fieldValidationErrors: FieldValidationErrors = {};
    for (const field of currentStep.fields) {
      const fieldErrors = state.fieldMeta[field.id]?.errors ?? [];
      if (fieldErrors.length === 0) continue;
      fieldValidationErrors[field.id] = fieldErrors;
    }
    return fieldValidationErrors;
  });

  const isSubmissionConfirmation =
    currentStep.stepId === "submission-confirmation";
  const isLastFormStep = currentStep.stepId === "declaration";
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

  return (
    <div className={designSystem.formRoot}>
      {!isSubmissionConfirmation && (
        <p className={designSystem.formTitle}> {formMeta.formTitle} </p>
      )}

      {!isSubmissionConfirmation && <h1>{currentStep.title}</h1>}
      {!isSubmissionConfirmation && currentStep.description && (
        <p className={designSystem.formStepDescription}>
          {currentStep.description}
        </p>
      )}
      <ErrorSummary errors={errors} />

      <div className={designSystem.formStep}>
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

        {isSubmissionConfirmation && (
          <SubmissionConfirmation
            key={"submission-confirmation"}
            serviceTitle={formMeta.formTitle}
            stepTitle={currentStep.title}
            nextSteps={currentStep.nextSteps}
            contactDetails={formMeta.contactDetails}
            onTryAgain={() => navigateToStep("check-your-answers")}
            submissionState={submissionState}
          />
        )}

        {fieldGroups.map((group) => {
          if (group.type === "show-hide") {
            const isOpen = showHideValues[group.toggle.id] ?? false;
            return (
              <React.Fragment key={group.toggle.id}>
                {/* Toggle button — hint and controlled fields live outside the
                    FieldRenderer so we can wrap them all in the content border */}
                <FieldRenderer
                  form={form}
                  field={group.toggle}
                  validationProperties={
                    formMeta.validationProperties[group.toggle.id]
                  }
                />
                {isOpen && (
                  <div data-show-hide-content>
                    {group.toggle.hint && <p data-hint>{group.toggle.hint}</p>}
                    {group.controlled.map((field) => (
                      <FieldRenderer
                        key={field.id}
                        form={form}
                        field={field}
                        validationProperties={
                          formMeta.validationProperties[field.id]
                        }
                      />
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          }

          if (group.type === "radio-conditional") {
            // Build a map of option value → [{field, validationProperties}]
            // so the radio FieldRenderer can render inset fields per option.
            const insetFieldsByOption = new Map(
              [...group.conditionalsByOption.entries()].map(
                ([optVal, insetFields]) => [
                  optVal,
                  insetFields.map((f) => ({
                    field: f,
                    validationProperties: formMeta.validationProperties[f.id],
                  })),
                ],
              ),
            );

            return (
              <FieldRenderer
                key={group.radio.id}
                form={form}
                field={group.radio}
                validationProperties={
                  formMeta.validationProperties[group.radio.id]
                }
                insetFieldsByOption={insetFieldsByOption}
              />
            );
          }

          return (
            <FieldRenderer
              key={group.field.id}
              form={form}
              field={group.field}
              validationProperties={
                formMeta.validationProperties[group.field.id]
              }
            />
          );
        })}

        {currentStep.stepId !== "submission-confirmation" && (
          <div className={designSystem.formNavigation}>
            {!hidePrevious && (
              <button
                data-variant="secondary"
                type="button"
                onClick={handlePrevious}
              >
                Previous
              </button>
            )}
            <button
              data-variant="primary"
              type="button"
              onClick={isLastFormStep ? handleSubmit : handleContinue}
            >
              {isLastFormStep ? "Submit" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
