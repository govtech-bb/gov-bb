import type { ComponentDefinition } from "../../definition-types";

export const fileComponent: ComponentDefinition = {
  ref: "components/file",
  displayName: "File Upload",
  primitive: {
    fieldId: "file",
    label: "File Upload",
    htmlType: "file",
    multiple: false,
  },
};
