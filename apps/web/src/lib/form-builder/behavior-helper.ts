import {
  FieldConditionalOnBehaviour,
  StepConditionalOnBehaviour,
} from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { ClientFormStep, FieldValue } from "@web/types";
import { evaluateCondition, RequiredState } from "./validation-methods";

export const checkConditionalOn = (
  currentFieldValue: FieldValue,
  conditionalOns: FieldConditionalOnBehaviour[] | StepConditionalOnBehaviour[],
  formApi: AnyFormApi,
): RequiredState => {
  if (conditionalOns.length === 0) return "unknownState";

  for (const condition of conditionalOns) {
    let targetFieldId = condition.targetFieldId;
    if (condition.targetStepId) {
      targetFieldId = `${condition.targetStepId}.${condition.targetFieldId}`;
    }

    const targetFieldValue = formApi.getFieldValue(targetFieldId);
    console.log({ targetFieldId });

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
