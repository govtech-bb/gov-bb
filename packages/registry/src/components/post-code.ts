import type { TextPrimitive } from "@govtech-bb/form-types";
import { POSTCODE_FORMAT } from "../barbados-id-patterns";

export const Postcode: TextPrimitive = {
  fieldId: "postcode",
  label: "Postcode",
  htmlType: "text",
  ui: {
    width: "short",
  },
  validations: {
    pattern: {
      value: POSTCODE_FORMAT.pattern,
      error: POSTCODE_FORMAT.error,
    },
  },
};
