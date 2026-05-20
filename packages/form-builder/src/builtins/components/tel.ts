import type { ComponentDefinition } from "../../definition-types";

export const telComponent: ComponentDefinition = {
  ref: "components/tel",
  displayName: "Telephone",
  primitive: {
    fieldId: "tel",
    label: "Telephone",
    htmlType: "tel",
  },
};
