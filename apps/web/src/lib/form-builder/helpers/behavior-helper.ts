import {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, FieldValue } from "@web/types";
import { evaluateCondition, RequiredState } from "../validation-methods";
import { getFullFieldId } from "../field-mapper";

export const checkConditionalOn = (
  currentFieldValue: FieldValue,
  conditionalOns: FieldConditionalOnBehaviour[] | StepConditionalOnBehaviour[],
  formApi: AnyFormApi,
  fieldStep?: string,
): RequiredState => {
  if (conditionalOns.length === 0) return "unknownState";

  for (const condition of conditionalOns) {
    const targetStepId: string | undefined =
      condition.targetStepId ?? fieldStep;
    let targetFieldId = condition.targetFieldId;
    if (targetStepId) {
      targetFieldId = getFullFieldId(targetStepId, condition.targetFieldId);
    }

    const targetFieldValue = formApi.getFieldValue(targetFieldId);

    const passesCondition = evaluateCondition(
      condition.value,
      targetFieldValue,
      condition.operator,
    );

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

// Other exports

export {
  setupRepeatSteps,
  generateRepeatableAddAnotherField,
} from "./repeatable-helper";
