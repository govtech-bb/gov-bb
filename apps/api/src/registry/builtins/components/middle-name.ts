import { TextPrimitive } from "@govtech-bb/form-types";

export const MiddleName: TextPrimitive = {
    fieldId: "middle-name",
    label: "Middle name",
    htmlType: "text",
    validations: {
        minLength: {
            value: 2,
            error: "Middle name must be at least 2 characters",
        },
        pattern: {
            value: "^\\s*[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ\\s'-]*[A-Za-zÀ-ÖØ-öø-ÿ])?\\s*$",
            error: "Middle name must contain only letters, hyphens, or apostrophes",
        },
    },
};
