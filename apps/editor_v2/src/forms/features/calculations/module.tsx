import { defineRenderer } from "../../../editor/react/contributions";
import type { FormModule } from "../../field";
import { formInsertionAction } from "../../editor/insertion-action";
import { AuthoringInsertionPreview } from "../../react/authoring-preview";
import { CalculatedFields } from "./presentation";
import { calculatedFieldsContent, calculationActions } from "./definition";
import { calculatedFieldsEntry } from "./insertion";

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
        <AuthoringInsertionPreview>
          {calculatedFieldsEntry.renderPreview(calculatedFieldsEntry.sample)}
        </AuthoringInsertionPreview>,
      ),
    ],
    renderers: [defineRenderer("widget:calculated-fields", CalculatedFields)],
  };
}
