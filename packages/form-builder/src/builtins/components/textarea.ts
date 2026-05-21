import type { ComponentDefinition } from "../../definition-types";

export const textareaComponent: ComponentDefinition = {
  ref: "components/textarea",
  displayName: "Text Area",
  primitive: {
    fieldId: "textarea",
    label: "Text Area",
    htmlType: "textarea",
  },
};
