import { TextPrimitive } from "@govtech-bb/form-types";

export const Name: TextPrimitive = {
  fieldId: "name",
  label: "Name",
  htmlType: "text",
  validations: {
    required: {
      value: true,
      error: "Name is required",
    },
    minLength: {
      value: 2,
      error: "Name must be at least 2 characters",
    },
    pattern: {
      value: "^\\s*[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ\\s'-]*[A-Za-zÀ-ÖØ-öø-ÿ])?\\s*$",
      error: "Name must contain only letters, hyphens, or apostrophes",
    },
  },
};
