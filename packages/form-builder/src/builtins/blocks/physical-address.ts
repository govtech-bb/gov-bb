import type { BlockDefinition } from "../../definition-types";

export const physicalAddressBlock: BlockDefinition = {
  ref: "blocks/physical-address",
  displayName: "Physical Address",
  block: {
    blockId: "physical-address",
    blockDescription: "Physical address (address lines, city, country)",
    blockVersion: "1.0.0",
    elements: [
      { fieldId: "address-line-1", label: "Address Line 1", htmlType: "text" },
      { fieldId: "address-line-2", label: "Address Line 2", htmlType: "text" },
      { fieldId: "city", label: "City", htmlType: "text" },
      { fieldId: "country", label: "Country", htmlType: "text" },
    ],
  },
};
