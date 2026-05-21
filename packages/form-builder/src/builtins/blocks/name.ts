import type { BlockDefinition } from "../../definition-types";

export const nameBlock: BlockDefinition = {
  ref: "blocks/name",
  displayName: "Name",
  block: {
    blockId: "name",
    blockDescription: "Full name (first + last)",
    blockVersion: "1.0.0",
    elements: [
      { fieldId: "first-name", label: "First Name", htmlType: "text" },
      { fieldId: "last-name", label: "Last Name", htmlType: "text" },
    ],
  },
};
