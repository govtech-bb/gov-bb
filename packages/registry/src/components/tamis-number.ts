import type { TextPrimitive } from "@govtech-bb/form-types";
import { TAMIS_FORMAT } from "../barbados-id-patterns";

export const TamisNumber: TextPrimitive = {
  fieldId: "tamis-number",
  label: "TAMIS number",
  htmlType: "text",
  validations: {
    pattern: {
      value: TAMIS_FORMAT.pattern,
      error: TAMIS_FORMAT.error,
    },
    minLength: {
      value: 10,
      error: "TAMIS number must be at least 10 digits",
    },
    maxLength: {
      value: 15,
      error: "TAMIS number must be 15 digits or fewer",
    },
  },
};
