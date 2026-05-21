import type { TextPrimitive } from "@govtech-bb/form-types";

export const FirstName: TextPrimitive = {
  fieldId: "first-name",
  label: "First name",
  htmlType: "text",
  validations: {
    required: {
      value: true,
      error: "First name is required",
    },
    minLength: {
      value: 2,
      error: "First name must be at least 2 characters",
    },
    pattern: {
      value:
        "^\\s*[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ\\s'-]*[A-Za-zÀ-ÖØ-öø-ÿ])?\\s*$",
      error: "First name must contain only letters, hyphens, or apostrophes",
    },
  },
};
