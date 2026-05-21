import type { ComponentDefinition } from "../../definition-types";

export const dateComponent: ComponentDefinition = {
  ref: "components/date",
  displayName: "Date",
  primitive: {
    fieldId: "date",
    label: "Date",
    htmlType: "date",
  },
};
