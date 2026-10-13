import type { TextPrimitive } from "@govtech-bb/form-types";
import { NATIONAL_ID_FORMAT, NATIONAL_ID_LABEL } from "../barbados-id-patterns";

export const NationalIdNumber: TextPrimitive = {
  fieldId: "national-id-number",
  label: NATIONAL_ID_LABEL,
  htmlType: "text",
  ui: {
    width: "short",
  },
  // Hard mask: 9 = digit, literal `-` auto-inserted. Limits input to ten
  // digits in the National ID shape (e.g. 850101-0001), blocking overflow
  // typing/paste and non-numeric characters. Mirrors the `pattern`.
  mask: NATIONAL_ID_FORMAT.mask,
  validations: {
    pattern: {
      value: NATIONAL_ID_FORMAT.pattern,
      error: NATIONAL_ID_FORMAT.error,
    },
  },
};
