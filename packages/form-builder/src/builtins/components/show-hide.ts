import type { ComponentDefinition } from "../../definition-types";

export const showHideComponent: ComponentDefinition = {
  ref: "components/show-hide",
  displayName: "Show / hide toggle",
  primitive: {
    fieldId: "show-hide",
    label: "Show / hide",
    htmlType: "show-hide",
  },
};
