import { FieldConditionalOnBehaviour } from "@govtech-bb/form-types";
import { AnyFormApi } from "@tanstack/react-form";
import { FieldValue } from "@web/types";
import { evaluateCondition, RequiredState } from "./validation-methods";

export const checkConditionalOn = (
  currentFieldValue: FieldValue,
  fieldConditionalOns: FieldConditionalOnBehaviour[],
  formApi: AnyFormApi,
): RequiredState => {
  if (fieldConditionalOns.length === 0) return "unknownState";

  for (const condition of fieldConditionalOns) {
    const targetFieldValue = formApi.getFieldValue(condition.targetFieldId);
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
