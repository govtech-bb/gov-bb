import type { TextPrimitive } from "@govtech-bb/form-types";
import { NATIONAL_INSURANCE_FORMAT } from "../barbados-id-patterns";

export const NationalInsuranceNumber: TextPrimitive = {
  fieldId: "national-insurance-number",
  label: "National Insurance number",
  htmlType: "text",
  ui: {
    width: "short",
  },
  // Hard mask: 9 = digit. Limits input to exactly six digits, blocking
  // overflow typing/paste and non-numeric characters. Mirrors the `pattern`.
  mask: NATIONAL_INSURANCE_FORMAT.mask,
  validations: {
    pattern: {
      value: NATIONAL_INSURANCE_FORMAT.pattern,
      error: NATIONAL_INSURANCE_FORMAT.error,
    },
  },
};
