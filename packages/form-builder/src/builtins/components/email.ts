import type { ComponentDefinition } from "../../definition-types";

export const emailComponent: ComponentDefinition = {
  ref: "components/email",
  displayName: "Email",
  primitive: {
    fieldId: "email",
    label: "Email",
    htmlType: "email",
  },
};
