import {
  ClientFormStep,
  ClientPrimitive,
  FieldValidationErrors,
  FormRendererProps,
} from "@web/types";
import FieldRenderer from "./field-renderer";
import designSystem from "../lib/design-system";
import React from "react";
import ErrorSummary from "./error-summary";
import { useStore } from "@tanstack/react-form";
import { useStepGuard } from "../hooks/use-step-guard";
import Review from "./review";
import {
  generateRepeatableAddAnotherField,
  generateRepeatStepFields,
  getFullFieldId,
  getRepeatStepId,
  getRepeatStepCount,
  repeatStepConcactenator,
} from "@web/lib";

// ---------------------------------------------------------------------------
// Show-hide grouping
// ---------------------------------------------------------------------------

type PlainFieldGroup = { type: "plain"; field: ClientPrimitive };
type ShowHideFieldGroup = {
  type: "show-hide";
  toggle: ClientPrimitive;
  controlled: ClientPrimitive[];
};
type FieldGroup = PlainFieldGroup | ShowHideFieldGroup;

/** Groups each show-hide toggle with the sibling fields whose
 *  `fieldConditionalOn` behaviour targets it, so they can all be wrapped
 *  inside a single `data-show-hide-content` container. */
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
  repeatableStepSettings,
  setRepeatableStepSettings,
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

  const repeatableBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "repeatable",
  )[0];
  const sharedFieldBehaviour = currentStep.behaviours?.filter(
    (b) => b.type === "sharedFields",
  )[0];

  const stepValues = useStore(form.store, (state) => state.values[stepId]);

  const baseStepId = stepId.split(repeatStepConcactenator)[0];
  const currentRepeatStepCount = getRepeatStepCount(stepId);

  const currentStepRepeatableSettings = repeatableStepSettings[baseStepId];
  const repeatableStepCount =
    currentStepRepeatableSettings?.orderedStepIds.length;

  const addRepeatableStep = (): ClientFormStep[] => {
    if (!currentStepRepeatableSettings) return visibleSteps;
    if (!repeatableBehaviour) return visibleSteps;
    if (
      repeatableBehaviour.max &&
      repeatableStepCount >= repeatableBehaviour.max
    )
      return visibleSteps;
    const nextStepId = getRepeatStepId(baseStepId, currentRepeatStepCount + 1);

    if (currentStepRepeatableSettings.orderedStepIds.includes(nextStepId))
      return visibleSteps;

    const nextStepFields = generateRepeatStepFields(
      currentFields,
      nextStepId,
      getFullFieldId(currentStep.stepId, "addAnother"),
      sharedFieldBehaviour,
    );
    if (
      repeatableBehaviour.max &&
      repeatableStepCount < repeatableBehaviour.max - 1
    ) {
      nextStepFields.push(generateRepeatableAddAnotherField(nextStepId));
    }

    const updatedRecord = currentStepRepeatableSettings;

    updatedRecord.stepData[stepId] = stepValues;
    updatedRecord.orderedStepIds.push(nextStepId);

    setRepeatableStepSettings((prev) => {
      return {
        ...prev,
        [baseStepId]: updatedRecord,
      };
    });

    const nextStep: ClientFormStep = {
      ...currentStep,
      fields: nextStepFields,
      stepId: nextStepId,
    };

    const currentStepIndex = formMeta.steps.indexOf(currentStep);
    formMeta.steps.splice(currentStepIndex + 1, 0, nextStep); // The real update

    // This is a temporary update that will be replaced when the useMemo recalculates visible steps due to the change in formMeta.steps
    // This is needed, since by the time we call completeAndContinue, the memoized visible steps would not have been recalculated yet
    // Meaning that completeAndContinue will still be operating on the "stale" list of steps.
    // By manually making the update here, and passing it directly to completeAndContinue, completeAndContinue gets to operate on the
    // updated version, or "future state" of visible steps.
    return [
      ...visibleSteps.slice(0, stepIndex + 1),
      nextStep,
      ...visibleSteps.slice(stepIndex + 1),
    ];
  };

  const removeRepeatableStep = (): ClientFormStep[] => {
    const index = getRepeatStepCount(stepId);
    if (index === 0) return visibleSteps;
    const targetStepId = getRepeatStepId(baseStepId, index ? index + 1 : 1);

    const record = repeatableStepSettings[baseStepId];
    if (!record?.orderedStepIds.includes(targetStepId)) return visibleSteps;

    const step = visibleSteps.find((s) => s.stepId === targetStepId);
    if (!step) {
      const pos = record.orderedStepIds.indexOf(targetStepId);
      if (pos !== -1) {
        record.orderedStepIds.splice(pos, 1);
      }
      return visibleSteps;
    }

    const orderedStepIds = [...record.orderedStepIds];

    const startIndex = orderedStepIds.indexOf(targetStepId);
    if (startIndex === -1) return visibleSteps;

    const toRemove: string[] = orderedStepIds.slice(startIndex);
    record.orderedStepIds = orderedStepIds.slice(0, startIndex);

    if (toRemove.length === 0) return visibleSteps;

    // Remove from formMeta
    const deleteFromIndex = formMeta.steps.findIndex(
      (s) => s.stepId === toRemove[0],
    );

    if (deleteFromIndex !== -1) {
      formMeta.steps.splice(deleteFromIndex, toRemove.length);
    }

    // Filter visible steps
    return visibleSteps.filter((step) => !toRemove.includes(step.stepId));
  };

  const handleContinue = () => {
    // Handle navigation to repeatable step.
    if (repeatableBehaviour) {
      const anotherFieldId = getFullFieldId(currentStep.stepId, "addAnother");

      const anotherFieldValue = form.getFieldValue(anotherFieldId);
      if (anotherFieldValue === "yes") {
        const updatedSteps = addRepeatableStep();
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      } else if (anotherFieldValue === "no") {
        const updatedSteps = removeRepeatableStep();
        completeAndContinue(currentStep.stepId, updatedSteps);
        return;
      }
    }
    // TODO: Validate current step before marking as completed and navigating to the next step
    completeAndContinue(currentStep.stepId);
  };

  const handleSubmit = () => {};

  const errors = useStore(form.store, (state) => {
    const fieldValidationErrors: FieldValidationErrors = {};
    for (const field of currentStep.fields) {
      const fieldErrors = state.fieldMeta[field.id]?.errors ?? [];
      if (fieldErrors.length === 0) continue;
      fieldValidationErrors[field.id] = fieldErrors;
    }
    return fieldValidationErrors;
  });

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
      <p className={designSystem.formTitle}> {formMeta.formTitle} </p>

      <h1>{currentStep.title}</h1>
      {/* {step.description && <p>{step.description}</p>} */}
      <ErrorSummary errors={errors} />

      <div className={designSystem.formStep}>
        {currentStep.stepId === "check-your-answers" && (
          <Review key={"review-step"} formMeta={formMeta} form={form} />
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
            onClick={
              stepIndex === visibleSteps.length - 1
                ? handleSubmit
                : handleContinue
            }
          >
            {stepIndex === visibleSteps.length - 1 ? "Submit" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
