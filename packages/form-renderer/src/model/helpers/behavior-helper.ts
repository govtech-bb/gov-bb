import {
  FieldConditionalOnBehaviour,
  FieldValue,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, ClientPrimitive } from "../../types";
import {
  evaluateCondition,
  flattenStepValues,
} from "@govtech-bb/form-conditions";
import { RequiredState } from "../validation-methods";
import { buildStepScopedValues } from "./value-tree";

export const checkConditionalOn = (
  currentFieldValue: FieldValue,
  conditionalOns: FieldConditionalOnBehaviour[] | StepConditionalOnBehaviour[],
  formApi: AnyFormApi,
  fieldStep?: string,
): RequiredState => {
  if (conditionalOns.length === 0) return "unknownState";

  // Build the stepId → { fieldId: value } tree (and its flat projection) the
  // shared evaluator consumes, from the form's composite-keyed state. This is
  // the same evaluator `apps/api` uses, so a condition's verdict here matches
  // the server's for the same values.
  const formValues = (formApi.state?.values ?? {}) as Record<string, unknown>;
  const values = buildStepScopedValues(formValues);
  // `flatValues` is only consulted by the shared evaluator when a condition has
  // no `targetStepId` AND no `fieldStep` fallback. Because `flattenStepValues`
  // last-wins-merges synthetic repeatable instance steps (they share bare
  // fieldIds), this flat lookup would be ambiguous inside a repeatable — but it
  // is unreachable in practice: callers always pass the field's `fieldStep`, so
  // resolution goes through `values[targetStepId][targetFieldId]` instead.
  const flatValues = flattenStepValues(values);

  for (const condition of conditionalOns) {
    // Preserve the client's historical `targetStepId ?? fieldStep` resolution:
    // a condition with no explicit target step resolves against the field's own
    // step. The shared evaluator reads `values[targetStepId][targetFieldId]`
    // (falling back to `flatValues[targetFieldId]` when there is no
    // `targetStepId`), so default the behaviour's `targetStepId` to `fieldStep`.
    const behaviour =
      condition.targetStepId || !fieldStep
        ? condition
        : { ...condition, targetStepId: fieldStep };

    const passesCondition = evaluateCondition(behaviour, values, flatValues);

    if (!currentFieldValue) currentFieldValue = "";
    if (passesCondition && currentFieldValue.toString().length == 0) {
      return "requiredAndEmpty";
    }
    if (passesCondition && currentFieldValue.toString().length) {
      return "notEmpty";
    }
  }

  return "notRequired";
};

const isStepVisible = (step: ClientFormStep, formApi: AnyFormApi) => {
  if (!step.behaviours || step.behaviours.length === 0) return true;
  const stepBehaviours: StepConditionalOnBehaviour[] = step.behaviours.filter(
    (b) => b.type === "stepConditionalOn",
  );
  const requiredState = checkConditionalOn("", stepBehaviours, formApi);

  if (requiredState === "notRequired") return false;
  return true;
};

const isFieldVisible = (
  field: ClientPrimitive,
  formApi: AnyFormApi,
): boolean => {
  if (field.hidden) return false;

  const fieldConditionalOns = field.behaviours?.filter(
    (b) => b.type === "fieldConditionalOn",
  );
  if (!fieldConditionalOns || fieldConditionalOns.length === 0) return true;

  // Mirrors the mount-time check in field-renderer.tsx: a field whose
  // conditions all fail is "notRequired" → hidden.
  const requiredState = checkConditionalOn(
    formApi.getFieldValue(field.id) as FieldValue,
    fieldConditionalOns,
    formApi,
    field.stepId,
  );
  return requiredState !== "notRequired";
};

// #737: visibility as an evaluated fact, not a render artifact. The
// `conditionallyHidden` flag is mutated as a render side-effect, so a
// conditional field that never re-mounts after its controlling answer flips
// keeps a stale flag — leaking de-selected answers into check-your-answers
// and the submission payload. Evaluating the behaviours directly gives
// review/submit the truth regardless of what last rendered. Form state is
// never cleared, so flipping the answer back restores what the user typed
// (keep-but-hide).
export const getVisibleFields = (
  step: ClientFormStep,
  formApi: AnyFormApi,
): ClientPrimitive[] => {
  // Repeatable steps keep the render-flag behaviour: their fields have
  // per-instance visibility semantics (see `activeFieldsByInstance` in
  // @govtech-bb/form-conditions) that a step-scoped evaluation can't
  // represent. Follow-up tracked in #737.
  const isRepeatable = step.behaviours?.some((b) => b.type === "repeatable");
  if (isRepeatable) {
    return step.fields.filter(
      (field) => !field.hidden && !field.conditionallyHidden,
    );
  }

  return step.fields.filter((field) => isFieldVisible(field, formApi));
};

export const getVisibleSteps = (
  formSteps: ClientFormStep[],
  formApi: AnyFormApi,
): ClientFormStep[] => {
  return formSteps.filter((step) => isStepVisible(step, formApi));
};

export const getStepConditonalTargets = (
  formSteps: ClientFormStep[],
): Record<string, string> => {
  const obj: Record<string, string> = {};

  for (const formStep of formSteps) {
    if (!formStep.behaviours) continue;
    const stepBehaviours: StepConditionalOnBehaviour[] =
      formStep.behaviours?.filter((b) => b.type === "stepConditionalOn");
    if (!stepBehaviours || stepBehaviours.length === 0) continue;

    for (const stepBehaviour of stepBehaviours) {
      obj[stepBehaviour.targetStepId ?? "temporary"] =
        stepBehaviour.targetFieldId;
    }
  }
  return obj;
};
