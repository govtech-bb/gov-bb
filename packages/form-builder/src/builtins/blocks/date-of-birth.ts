import type { BlockDefinition } from "../../definition-types";

export const dateOfBirthBlock: BlockDefinition = {
  ref: "blocks/date-of-birth",
  displayName: "Date of Birth",
  block: {
    blockId: "date-of-birth",
    blockDescription: "Date of birth (day, month, year)",
    blockVersion: "1.0.0",
    elements: [
      { fieldId: "day", label: "Day", htmlType: "number" },
      { fieldId: "month", label: "Month", htmlType: "number" },
      { fieldId: "year", label: "Year", htmlType: "number" },
    ],
  },
};
