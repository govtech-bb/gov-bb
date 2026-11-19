import { defineRenderer } from "@/editor/react";
import type { FormModule } from "../field";
import { formInsertionAction } from "../canvas/insertion-action";
import { CalculatedFields } from "./calculated-field-presentation";
import { calculatedFieldsContent, calculationActions } from "./calculated-field-definition";
import { calculatedFieldsEntry } from "./calculated-field-insertion";

export function CalculationsModule(): FormModule {
  return {
    key: "form-calculations",
    requires: ["form"],
    contents: [calculatedFieldsContent],
    logicActions: calculationActions,
    nativeCapabilities: {
      actions: ["setValue"],
      operators: [
        "add",
        "subtract",
        "multiply",
        "divide",
        "min",
        "max",
        "round",
        "coalesce",
        "year",
        "monthsBetween",
        "wholeYearsBetween",
        "daysBetween",
        "concat",
        "toText",
        "lookup",
      ],
    },
    actions: [
      formInsertionAction(
        calculatedFieldsEntry,
        "Advanced blocks",
        4001,
        calculatedFieldsEntry.renderPreview(calculatedFieldsEntry.sample),
      ),
    ],
    renderers: [defineRenderer("widget:calculated-fields", CalculatedFields)],
  };
}
