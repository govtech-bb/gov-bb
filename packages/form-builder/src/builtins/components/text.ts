import type { ComponentDefinition } from "../../definition-types";

export const textComponent: ComponentDefinition = {
  ref: "components/text",
  displayName: "Text",
  primitive: {
    fieldId: "text",
    label: "Text",
    htmlType: "text",
  },
};
