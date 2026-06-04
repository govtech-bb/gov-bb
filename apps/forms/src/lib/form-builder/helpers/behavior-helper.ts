import {
  FieldConditionalOnBehaviour,
  FieldValue,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep } from "@forms/types";
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
