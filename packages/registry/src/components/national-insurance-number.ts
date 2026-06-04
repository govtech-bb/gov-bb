import type { TextPrimitive } from "@govtech-bb/form-types";

export const NationalInsuranceNumber: TextPrimitive = {
  fieldId: "national-insurance-number",
  label: "National Insurance number",
  htmlType: "text",
  validations: {
    pattern: {
      value: "^[A-Z]{2}\\d{6}[A-Z]$",
      error: "Enter a valid National Insurance number (for example, AB123456C)",
    },
  },
};
