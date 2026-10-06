import { Calculator, Sigma } from "@phosphor-icons/react";
import { defineContent } from "../../content";
import type { LogicActionDefinition } from "../../field";

import { nativeContent } from "../../native";

export const calculatedFieldsContent = defineContent({
  native: nativeContent("calculated-fields", { kind: "calculated", blockType: "calculated" }),
  kind: "calculated-fields",
  label: "Calculated fields",
  icon: <Sigma />,
  source: {
    storage: {
      type: "widget",
      property: "widget",
      value: "calculated-fields",
      defaultValue: "page-break",
    },
    syntax: { type: "json", name: "calculated-fields" },
  },
});

export const calculationActions: readonly LogicActionDefinition[] = [
  { type: "CALCULATE", label: "Calculate", icon: <Calculator />, order: 1 },
];
