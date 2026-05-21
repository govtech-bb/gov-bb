import type { ComponentDefinition } from "../../definition-types";

export const selectComponent: ComponentDefinition = {
  ref: "components/select",
  displayName: "Select",
  primitive: {
    fieldId: "select",
    label: "Select",
    htmlType: "select",
    options: [],
    multiple: false,
  },
};
