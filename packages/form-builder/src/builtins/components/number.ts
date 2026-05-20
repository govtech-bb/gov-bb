import type { ComponentDefinition } from "../../definition-types";

export const numberComponent: ComponentDefinition = {
  ref: "components/number",
  displayName: "Number",
  primitive: {
    fieldId: "number",
    label: "Number",
    htmlType: "number",
  },
};
